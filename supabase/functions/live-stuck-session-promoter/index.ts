/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * live-stuck-session-promoter
 * -----------------------------------------------------------------
 * Safety-net cuối cùng cho webcam replay reliability.
 *
 * Quét mỗi 1 phút mọi `live_sessions` mode=agora_webcam đang ở trạng
 * thái active nhưng heartbeat host đã chết > 90s (mặc định) — bất kể
 * `live-zombie-cleanup` chạy thành công hay không.
 *
 * v2 (12/06/2026): Priority queue + max-duration ceiling 4h.
 *  - Priority A: status in (live, reconnecting, starting, created,
 *    recording, processing, processing_replay) → forceEndLive.
 *  - Priority B: status='ending' → ưu tiên cuối, escalate hard-end nếu
 *    > 30' không thoát ('ending' starve được khắc phục).
 *  - Max duration: started_at <= now() - AGORA_MAX_SESSION_HOURS (4h
 *    mặc định) → force end với reason 'max_duration_exceeded'.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, createAdminClient, json } from '../_shared/httpAuth.ts';
import { forceEndLive } from '../_shared/liveEndService.ts';

const STALE_HEARTBEAT_MS = 60_000;
const POST_LIVE_CEILING_MS = 15 * 60_000;
const ENDING_HARD_FINALIZE_MS = 30 * 60_000; // session.status='ending' > 30' → hard finalize
const AGORA_MAX_SESSION_HOURS = Math.max(1, Number(Deno.env.get('AGORA_MAX_SESSION_HOURS') || 4));

async function requireCronOrAdmin(req: Request) {
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('X-Cron-Secret') || req.headers.get('x-cron-secret');
  const admin = createAdminClient() as any;
  if (cronSecret && provided === cronSecret) return { ok: true as const, admin };

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')) || '';
  if (!authHeader && !cronSecret) return { ok: true as const, admin };
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const token = authHeader.slice('Bearer '.length).trim();
  if (token && token === anonKey) return { ok: true as const, admin };

  const client = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, admin };
}

function resolveReplayState(session: any) {
  const hasMp4 = !!session.r2_video_url
    || (session.playback_url && /\.mp4(\?|$)/i.test(String(session.playback_url)));
  const hasHls = !hasMp4
    && session.playback_url
    && /\.m3u8(\?|$)/i.test(String(session.playback_url));
  if (hasMp4) {
    return { replay_status: 'ready_mp4', playback_type: 'mp4', provider: 'r2', url: session.r2_video_url || session.playback_url };
  }
  if (hasHls) {
    return { replay_status: 'ready_hls', playback_type: 'hls', provider: 'r2_temp', url: session.playback_url };
  }
  return { replay_status: 'failed_no_recording', playback_type: 'processing', provider: session.playback_provider || 'r2_temp', url: null };
}

async function ensurePostEnded(admin: any, session: any) {
  const postId = session.post_id || session.live_post_id;
  if (!postId) return { post_id: null, synced: false };
  const { data: post } = await admin.from('posts').select('id, post_type, metadata, replay_status').eq('id', postId).maybeSingle();
  if (!post) return { post_id: postId, synced: false, reason: 'post_not_found' };
  const metadataLiveStatus = (post.metadata as any)?.live_status;
  const alreadySynced = post.post_type === 'live_replay' && metadataLiveStatus === 'ended' && !!post.replay_status;
  if (alreadySynced) return { post_id: postId, synced: false, reason: 'already_synced' };
  const state = resolveReplayState(session);
  const baseMeta = (post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata as Record<string, unknown> : {};
  const processingMessage = state.replay_status === 'failed_no_recording' ? 'Khong luu duoc video replay cho phien live nay.' : null;
  await admin.from('posts').update({
    post_type: 'live_replay',
    video_url: state.url || (post as any).video_url || null,
    metadata: {
      ...baseMeta,
      live_status: 'ended', live_mode: session.mode || 'agora_webcam', live_session_id: session.id,
      ended_at: session.ended_at || new Date().toISOString(),
      end_reason: session.end_reason || 'stuck_promoter',
      replay_status: state.replay_status,
      replay_ready: state.replay_status === 'ready_mp4' || state.replay_status === 'ready_hls',
      playback_url: state.url,
      playback_hls: state.replay_status === 'ready_hls' ? state.url : null,
      r2_video_url: state.replay_status === 'ready_mp4' ? state.url : null,
      playback_provider: state.provider, storage_provider: state.provider,
      recording_status: session.recording_status || null,
      recording_error: session.recording_error || null,
      processing_message: processingMessage,
    },
    replay_status: state.replay_status,
    playback_provider: state.provider,
    replay_ready: state.replay_status === 'ready_mp4' || state.replay_status === 'ready_hls',
    processing_message: processingMessage,
    updated_at: new Date().toISOString(),
  }).eq('id', postId);
  return { post_id: postId, synced: true, replay_status: state.replay_status };
}

async function ensureReplayRow(admin: any, session: any) {
  const userId = session.host_user_id || session.owner_id || session.user_id;
  if (!userId) return { upserted: false, reason: 'no_user_id' };
  const state = resolveReplayState(session);
  await admin.from('live_replays').upsert({
    user_id: userId, live_session_id: session.id, chunked_recording_id: session.id,
    status: state.replay_status === 'ready_mp4' || state.replay_status === 'ready_hls' ? 'ready' : 'failed',
    replay_status: state.replay_status,
    playback_type: state.playback_type,
    playback_hls: state.replay_status === 'ready_hls' ? state.url : null,
    playback_mp4: state.replay_status === 'ready_mp4' ? state.url : null,
    r2_video_url: state.replay_status === 'ready_mp4' ? state.url : null,
    playback_provider: state.provider, storage_provider: state.provider,
    archive_status: state.replay_status === 'ready_mp4' ? 'r2_ready' : state.replay_status === 'ready_hls' ? 'pending' : 'failed',
    error_message: state.replay_status === 'failed_no_recording' ? 'Khong luu duoc video replay cho phien live nay.' : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'chunked_recording_id' });
  return { upserted: true, replay_status: state.replay_status };
}

async function hardFinalize(admin: any, session: any, reason: string) {
  const now = new Date().toISOString();
  await admin.from('live_sessions').update({
    status: 'ended',
    ended_at: session.ended_at || now,
    end_reason: session.end_reason || reason,
    host_connection_status: 'offline',
    recording_status: session.recording_status && ['ready','stopped','failed','missed'].includes(session.recording_status) ? session.recording_status : 'failed',
    archive_status: 'unrecoverable',
    archive_next_retry_at: null,
    archive_error: session.archive_error || reason,
    updated_at: now,
  }).eq('id', session.id);
  await admin.from('live_session_events').insert({
    live_session_id: session.id,
    from_status: session.status,
    to_status: 'ended',
    source: 'live-stuck-session-promoter',
    reason,
    payload: { live_session_id: session.id, hard_finalize: true, previous_status: session.status, timestamp: now },
  }).then(undefined, () => undefined);
  const refreshed = (await admin.from('live_sessions').select('*').eq('id', session.id).maybeSingle()).data || { ...session, status: 'ended', ended_at: now };
  await ensureReplayRow(admin, refreshed).catch(() => undefined);
  await ensurePostEnded(admin, refreshed).catch(() => undefined);
}

async function tryForceEnd(admin: any, session: any, reason: string) {
  try {
    const result = await forceEndLive(admin, session.id, reason, { source: 'live-stuck-session-promoter' });
    const refreshed = (await admin.from('live_sessions').select('*').eq('id', session.id).maybeSingle()).data || session;
    await ensureReplayRow(admin, refreshed).catch(() => undefined);
    const sync = await ensurePostEnded(admin, refreshed).catch((err: unknown) => ({ error: String(err) }));
    return { id: session.id, result, sync };
  } catch (err) {
    return { id: session.id, error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const guard = await requireCronOrAdmin(req);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin as any;

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(100, Number(body.limit || 50)));

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_HEARTBEAT_MS).toISOString();
  const ceilingCutoff = new Date(now - POST_LIVE_CEILING_MS).toISOString();
  const endingHardCutoff = new Date(now - ENDING_HARD_FINALIZE_MS).toISOString();
  const maxDurationCutoff = new Date(now - AGORA_MAX_SESSION_HOURS * 60 * 60_000).toISOString();

  const promoted: any[] = [];
  const endingHardFinalized: any[] = [];
  const maxDuration: any[] = [];
  const synced: any[] = [];

  // ===== Priority A: ACTIVE statuses (heartbeat dead) =====
  try {
    const { data: stale } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'agora_webcam')
      .in('status', ['live', 'reconnecting', 'starting', 'created', 'recording', 'processing', 'processing_replay'])
      .or(`last_seen_at.lte.${staleCutoff},and(last_seen_at.is.null,last_host_heartbeat_at.lte.${staleCutoff}),and(last_seen_at.is.null,last_host_heartbeat_at.is.null,updated_at.lte.${staleCutoff})`)
      .order('updated_at', { ascending: true })
      .limit(limit);

    for (const session of stale || []) {
      // Short-circuit nếu replay đã ready
      const { data: existingReplay } = await admin
        .from('live_replays')
        .select('id, status, replay_status, playback_mp4, r2_video_url, r2_bucket, r2_object_key, replay_post_id, replay_ready_at, archived_at')
        .eq('live_session_id', session.id).maybeSingle();
      const replayAlreadyReady = existingReplay && existingReplay.status === 'ready'
        && existingReplay.replay_status === 'ready_mp4'
        && (existingReplay.playback_mp4 || existingReplay.r2_video_url)
        && existingReplay.replay_post_id;
      if (replayAlreadyReady) {
        const archiveUrl = existingReplay.playback_mp4 || existingReplay.r2_video_url;
        const completedAt = existingReplay.replay_ready_at || existingReplay.archived_at || new Date().toISOString();
        await admin.from('live_sessions').update({
          status: 'ended', ended_at: session.ended_at || completedAt,
          recording_status: 'ready', archive_status: 'r2_ready',
          archive_url: archiveUrl, replay_url: archiveUrl, playback_url: archiveUrl,
          playback_provider: 'r2', storage_provider: 'r2',
          r2_video_url: archiveUrl, replay_post_id: existingReplay.replay_post_id,
          end_reason: session.end_reason || 'host_disconnected_timeout',
          updated_at: new Date().toISOString(),
        }).eq('id', session.id);
        promoted.push({ id: session.id, short_circuit: 'replay_already_ready' });
        continue;
      }
      promoted.push(await tryForceEnd(admin, session, 'host_disconnected_timeout'));
    }
  } catch (err) {
    console.error('[promoter] priorityA failed', err);
  }

  // ===== Max duration ceiling (any active status > 4h) =====
  try {
    const { data: longSessions } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'agora_webcam')
      .in('status', ['live', 'reconnecting', 'starting', 'created', 'recording', 'processing', 'processing_replay'])
      .lte('started_at', maxDurationCutoff)
      .order('started_at', { ascending: true })
      .limit(limit);
    for (const session of longSessions || []) {
      if (promoted.some((p) => p.id === session.id)) continue;
      maxDuration.push(await tryForceEnd(admin, session, 'max_duration_exceeded'));
    }
  } catch (err) {
    console.error('[promoter] maxDuration failed', err);
  }

  // ===== Priority B: ENDING starve guard (hard finalize if > 30') =====
  try {
    const { data: stuckEnding } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'agora_webcam')
      .eq('status', 'ending')
      .lte('updated_at', endingHardCutoff)
      .order('updated_at', { ascending: true })
      .limit(limit);
    for (const session of stuckEnding || []) {
      try {
        await hardFinalize(admin, session, 'ending_starve_hard_finalize');
        endingHardFinalized.push({ id: session.id, ok: true });
      } catch (err) {
        endingHardFinalized.push({ id: session.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    console.error('[promoter] endingStarve failed', err);
  }

  // ===== Pass: post `live` quá 15' nhưng session đã ended → re-sync post =====
  try {
    const { data: orphanPosts } = await admin
      .from('posts')
      .select('id, post_type, metadata, video_url, replay_status, created_at')
      .eq('post_type', 'live')
      .lte('created_at', ceilingCutoff)
      .limit(limit);
    for (const post of orphanPosts || []) {
      const meta = (post.metadata && typeof post.metadata === 'object') ? post.metadata as any : {};
      const sid = meta.live_session_id;
      if (!sid) continue;
      const { data: session } = await admin.from('live_sessions').select('*').eq('id', sid).maybeSingle();
      if (!session || session.status !== 'ended') continue;
      try {
        await ensureReplayRow(admin, session);
        const r = await ensurePostEnded(admin, session);
        if (r.synced) synced.push({ post_id: post.id, session_id: sid, replay_status: r.replay_status });
      } catch (err) {
        synced.push({ post_id: post.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    console.error('[promoter] postSync failed', err);
  }

  const summary = {
    ok: true,
    config: {
      stale_heartbeat_ms: STALE_HEARTBEAT_MS,
      ending_hard_finalize_ms: ENDING_HARD_FINALIZE_MS,
      agora_max_session_hours: AGORA_MAX_SESSION_HOURS,
    },
    promoted_count: promoted.length,
    max_duration_count: maxDuration.length,
    ending_hard_finalized_count: endingHardFinalized.length,
    synced_count: synced.length,
    promoted, max_duration: maxDuration, ending_hard_finalized: endingHardFinalized, synced,
  };
  console.log('[live-stuck-session-promoter] tick', JSON.stringify({
    promoted: summary.promoted_count,
    max_duration: summary.max_duration_count,
    ending_hard_finalized: summary.ending_hard_finalized_count,
    synced: summary.synced_count,
  }));
  return json(summary);
});
