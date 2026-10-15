/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, createAdminClient, json } from '../_shared/httpAuth.ts';
import { listR2Objects, publicTempUrl } from '../_shared/r2MultiBucketService.ts';
import { createOrUpdateTempHlsReplayPost } from '../_shared/replayFeedService.ts';


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

function userIdOf(session: any): string | null {
  return session.host_user_id || session.owner_id || session.user_id || null;
}

function tempPrefixOf(session: any, userId: string): string {
  return (session.temp_object_key || `agora-temp/${userId}/${session.id}`).replace(/\/+$/, '');
}

function pickMainHls(files: Array<{ key: string; size: number }>): { key: string; size: number } | null {
  return files.find((file) => file.key.endsWith('.m3u8') && !file.key.endsWith('_0.m3u8'))
    || files.find((file) => file.key.endsWith('.m3u8'))
    || null;
}

function pickMp4(files: Array<{ key: string; size: number }>): { key: string; size: number } | null {
  return files
    .filter((file) => file.key.endsWith('.mp4'))
    .sort((a, b) => b.size - a.size)[0]
    || null;
}

async function logEvent(admin: any, session: any, event: string, payload: Record<string, unknown> = {}) {
  await admin.from('live_session_events').insert({
    live_session_id: session.id,
    reason: event,
    source: 'live-webcam-replay-reconciler',
    payload: {
      live_session_id: session.id,
      user_id: userIdOf(session),
      ...payload,
      timestamp: new Date().toISOString(),
    },
  }).then(undefined, () => undefined);
}

async function scheduleRetry(admin: any, session: any, reason: string, errorMessage?: string) {
  const retryCount = Number(session.archive_retry_count || 0) + 1;
  const retryDelayMs = Math.min(15 * 60_000, 30_000 * (2 ** Math.min(retryCount - 1, 5)));
  const nextRetryAt = new Date(Date.now() + retryDelayMs).toISOString();
  await admin.from('live_sessions').update({
    archive_retry_count: retryCount,
    archive_next_retry_at: nextRetryAt,
    archive_error: errorMessage || reason,
    updated_at: new Date().toISOString(),
  }).eq('id', session.id);
  await logEvent(admin, session, 'replay_reconcile_retry_scheduled', {
    reason,
    retry_count: retryCount,
    retry_delay_ms: retryDelayMs,
    error: errorMessage || null,
  });
}

async function syncReadyHls(admin: any, session: any, input: {
  hlsUrl: string;
  tempBucket: string | null;
  tempPrefix: string | null;
  tempHlsKey: string | null;
  tempMp4Key?: string | null;
  tempTotalSize?: number | null;
  source: string;
}) {
  const userId = userIdOf(session);
  if (!userId) throw new Error('Missing user id');

  const now = new Date().toISOString();
  const { data: replay, error } = await admin
    .from('live_replays')
    .upsert({
      user_id: userId,
      live_session_id: session.id,
      chunked_recording_id: session.id,
      status: 'ready',
      replay_status: 'ready_hls',
      playback_type: 'hls',
      playback_hls: input.hlsUrl,
      playback_mp4: null,
      temp_bucket: input.tempBucket,
      temp_prefix: input.tempPrefix,
      temp_hls_key: input.tempHlsKey,
      temp_hls_url: input.hlsUrl,
      temp_mp4_key: input.tempMp4Key || null,
      temp_total_size: input.tempTotalSize || null,
      hls_ready_at: now,
      archive_status: 'pending',
      cleanup_status: 'pending',
      storage_provider: 'r2_temp',
      playback_provider: 'r2_temp',
      error_message: null,
      updated_at: now,
    }, { onConflict: 'chunked_recording_id' })
    .select('*')
    .single();
  if (error) throw error;

  const replayPostId = await createOrUpdateTempHlsReplayPost(admin, replay, input.hlsUrl);
  if (!replayPostId) throw new Error('Replay post not synced');

  await admin.from('live_replays').update({
    replay_post_id: replayPostId,
    posted_at: replay.posted_at || now,
    auto_posted_at: replay.auto_posted_at || now,
    updated_at: now,
  }).eq('id', replay.id);

  await admin.from('live_sessions').update({
    status: 'ended',
    recording_status: session.recording_status === 'ready' ? 'ready' : 'stopped',
    archive_status: 'pending',
    archive_next_retry_at: now,
    archive_error: null,
    temp_bucket: input.tempBucket,
    temp_object_key: input.tempPrefix,
    replay_url: input.hlsUrl,
    playback_url: input.hlsUrl,
    hls_url: input.hlsUrl,
    playback_provider: 'r2_temp',
    storage_provider: 'r2_temp',
    replay_post_id: replayPostId,
    updated_at: now,
  }).eq('id', session.id);

  await logEvent(admin, session, 'replay_reconciled_ready_hls', {
    source: input.source,
    replay_id: replay.id,
    replay_post_id: replayPostId,
    temp_bucket: input.tempBucket,
    temp_prefix: input.tempPrefix,
    temp_hls_key: input.tempHlsKey,
  });

  return { replay, replayPostId };
}

async function processSession(admin: any, session: any): Promise<Record<string, unknown>> {
  if (session.r2_video_url) {
    return { id: session.id, status: 'skip_ready_mp4' };
  }

  const userId = userIdOf(session);
  if (!userId) return { id: session.id, status: 'skip_missing_user' };

  const { data: existingReplay } = await admin
    .from('live_replays')
    .select('id, replay_status, temp_hls_url, playback_hls, replay_post_id, temp_bucket, temp_prefix, temp_hls_key, temp_mp4_key, temp_total_size')
    .eq('live_session_id', session.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingHlsUrl = existingReplay?.temp_hls_url || existingReplay?.playback_hls || null;
  if (existingReplay?.replay_status === 'ready_mp4') {
    return { id: session.id, status: 'skip_replay_ready_mp4', replay_id: existingReplay.id };
  }
  if (existingReplay?.replay_status === 'ready_hls' && existingHlsUrl) {
    const synced = await syncReadyHls(admin, session, {
      hlsUrl: existingHlsUrl,
      tempBucket: existingReplay.temp_bucket || session.temp_bucket || Deno.env.get('R2_TEMP_BUCKET') || 'r2livetemp',
      tempPrefix: existingReplay.temp_prefix || session.temp_object_key || tempPrefixOf(session, userId),
      tempHlsKey: existingReplay.temp_hls_key || null,
      tempMp4Key: existingReplay.temp_mp4_key || null,
      tempTotalSize: existingReplay.temp_total_size || null,
      source: 'existing_live_replay_ready_hls',
    });
    return { id: session.id, status: 'resynced_post_from_live_replay', replay_id: synced.replay.id, post_id: synced.replayPostId };
  }

  const tempBucket = session.temp_bucket || Deno.env.get('R2_TEMP_BUCKET') || 'r2livetemp';
  const tempPrefix = tempPrefixOf(session, userId);
  let tempObjects: Array<{ key: string; size: number }> = [];
  try {
    tempObjects = (await listR2Objects(tempBucket, tempPrefix, 5000)).filter((file) => file.size > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await scheduleRetry(admin, session, 'temp_scan_failed', message);
    return { id: session.id, status: 'temp_scan_failed', error: message };
  }

  const hls = pickMainHls(tempObjects);
  if (!hls) {
    await scheduleRetry(admin, session, 'no_hls_found');
    return { id: session.id, status: 'no_hls_found', seen: tempObjects.length, temp_prefix: tempPrefix };
  }

  const hlsUrl = publicTempUrl(hls.key);
  if (!hlsUrl) throw new Error('R2_TEMP_PUBLIC_BASE_URL is required to reconcile temp HLS');
  const mp4 = pickMp4(tempObjects);
  const tempTotalSize = tempObjects.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const synced = await syncReadyHls(admin, session, {
    hlsUrl,
    tempBucket,
    tempPrefix,
    tempHlsKey: hls.key,
    tempMp4Key: mp4?.key || null,
    tempTotalSize,
    source: 'r2_temp_scan',
  });

  return {
    id: session.id,
    status: 'reconciled_ready_hls',
    replay_id: synced.replay.id,
    post_id: synced.replayPostId,
    hls_key: hls.key,
    seen: tempObjects.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const guard = await requireCronOrAdmin(req);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin as any;

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(50, Number(body.limit || 10)));
    const nowIso = new Date().toISOString();

    let query = admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'agora_webcam')
      .is('deleted_at', null)
      .not('ended_at', 'is', null)
      .or(`archive_next_retry_at.is.null,archive_next_retry_at.lte.${nowIso}`);

    if (typeof body.session_id === 'string' && body.session_id.trim()) {
      query = query.eq('id', body.session_id.trim());
    } else {
      query = query
        .or('replay_url.is.null,playback_url.is.null,replay_post_id.is.null,archive_status.in.(pending,failed,unrecoverable)')
        .order('ended_at', { ascending: true, nullsFirst: false })
        .limit(limit);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];
    for (const session of rows || []) {
      try {
        results.push(await processSession(admin, session));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await scheduleRetry(admin, session, 'session_reconcile_failed', message);
        results.push({ id: session.id, status: 'error', error: message });
      }
    }

    return json({ ok: true, scanned: rows?.length || 0, results, timestamp: nowIso });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[live-webcam-replay-reconciler] fatal', message);
    return json({ error: message }, 500);
  }
});
