/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { detectRtmpLiveConnection, getStreamPlaybackUrls, listStreamLiveInputVideos, selectRtmpReplayVideoForSession } from '../_shared/cloudflareStreamService.ts';
import { createOrUpdateInstantReplayPost } from '../_shared/replayFeedService.ts';
import { archiveReplay, cleanupArchivedStreamVideos, pollMp4ForReplay } from '../_shared/archiveReplayService.ts';
import { endRtmpLiveSession, getObsReconnectTimeoutSeconds } from '../_shared/rtmpEndLiveService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  return authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    !!(cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
}

async function recoverMissingRtmpReplays(admin: any): Promise<number> {
  const { data: sessions } = await admin
    .from('live_sessions')
    .select('id, owner_id, host_user_id, user_id, cloudflare_live_input_id, cloudflare_video_uid, post_id, live_post_id, title, started_at, go_live_clicked_at, created_at, ended_at, updated_at')
    .eq('mode', 'rtmp_obs')
    .in('status', ['ended', 'replay_temp_ready', 'processing', 'processing_stream', 'stream_ready', 'exporting_mp4', 'archiving_r2', 'uploading_r2', 'verifying_r2', 'failed'])
    .not('cloudflare_live_input_id', 'is', null)
    .or('post_id.not.is.null,live_post_id.not.is.null')
    .order('updated_at', { ascending: true })
    .limit(30);

  let recovered = 0;
  for (const session of sessions || []) {
    const { data: existing } = await admin
      .from('live_replays')
      .select('id')
      .eq('live_session_id', session.id)
      .limit(1)
      .maybeSingle();
    if (existing?.id) continue;

    // Poll 2 láº§n Ã— 1.5s â€” phÃ²ng khi recover cron tá»›i sá»›m hÆ¡n UID materialize.
    let videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
    if (videos.length === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
    }
    const selection = selectRtmpReplayVideoForSession(videos as any, session, session.cloudflare_video_uid || null, {
      skewSeconds: 60,
      afterEndMinutes: 10,
    });
    const video = selection.video as any;
    if (!video?.uid) {
      console.warn('[RTMP_RECOVER_REPLAY_NO_STRICT_VIDEO]', {
        live_session_id: session.id,
        live_input_id: session.cloudflare_live_input_id,
        preferredUid: session.cloudflare_video_uid || null,
        reason: selection.reason,
        candidates: selection.candidates,
        rejected: selection.rejected.slice(0, 5),
      });
      continue;
    }

    const uid = String(video.uid);
    const urls = getStreamPlaybackUrls(uid);
    await admin.from('live_sessions').update({
      cloudflare_video_uid: uid,
      // NÃ¢ng status sang replay_temp_ready Ä‘á»ƒ FE/Ops tháº¥y cÃ³ replay táº¡m thá»i ngay.
      status: 'replay_temp_ready',
      recording_status: video?.readyToStream ? 'ready' : 'processing',
      recording_ready_at: video?.readyToStream ? new Date().toISOString() : null,
      archive_status: 'pending',
      archive_error: null,
    }).eq('id', session.id).in('status', ['ended', 'failed', 'processing']);

    const { data: replay, error } = await admin.from('live_replays').upsert({
      live_session_id: session.id,
      user_id: session.owner_id || session.host_user_id || session.user_id,
      // RTMP replays do not have a chunked_recordings row; use the live session UUID
      // so this UUID column stays valid and remains one replay per session.
      chunked_recording_id: session.id,
      stream_uid: uid,
      cloudflare_video_uid: uid,
      playback_hls: urls.hls,
      playback_dash: urls.dash,
      playback_mp4: urls.mp4,
      cloudflare_playback_url: urls.hls,
      status: 'ready',
      processing_started_at: new Date().toISOString(),
      storage_provider: 'cloudflare_stream',
      playback_provider: 'cloudflare_temp',
      archive_status: 'pending',
      archive_error: null,
      cloudflare_vod_enabled: true,
      last_cf_response: video,
    }, { onConflict: 'chunked_recording_id' }).select('*').single();
    if (!error) {
      const postId = await createOrUpdateInstantReplayPost(admin as any, replay, urls.hls);
      if (postId && replay?.id) {
        await admin.from('live_replays').update({
          replay_post_id: postId,
          auto_posted_at: replay.auto_posted_at || new Date().toISOString(),
          posted_at: replay.posted_at || new Date().toISOString(),
        }).eq('id', replay.id);
      }
      recovered += 1;
    }
  }
  return recovered;
}

/**
 * ÄÃ¡nh dáº¥u replay vÄ©nh viá»…n khÃ´ng thá»ƒ archive Ä‘Æ°á»£c:
 *   - chunked_recording Ä‘Ã£ FAILED (khÃ´ng cÃ³ chunks)
 *   - chunked_recording total_chunks=0 vÃ  Ä‘Ã£ >1h (Agora khÃ´ng upload Ä‘Æ°á»£c chunks)
 *   - replay káº¹t á»Ÿ queued/normalizing khÃ´ng cÃ³ stream_uid > 24h (concat/ingest fail mÃ£i)
 */
async function markUnrecoverableReplays(admin: any): Promise<{ chunked_failed: number; stuck_queued: number }> {
  // Bucket 1: chunked_recording failed/empty
  const { data: failedRecs } = await admin
    .from('chunked_recordings')
    .select('id')
    .or('status.eq.failed,and(total_chunks.eq.0,created_at.lt.' + new Date(Date.now() - 60 * 60 * 1000).toISOString() + ')')
    .limit(200);
  const failedIds = (failedRecs || []).map((r: any) => r.id);

  let chunked_failed = 0;
  if (failedIds.length) {
    const { data: updated } = await admin
      .from('live_replays')
      .update({
        archive_status: 'unrecoverable',
        archive_error: 'chunked_recording failed/empty (no chunks to archive)',
        archive_next_retry_at: null,
      })
      .in('chunked_recording_id', failedIds)
      .eq('archive_status', 'pending')
      .select('id');
    chunked_failed = (updated || []).length;
  }

  // Bucket 2: replay káº¹t queued/normalizing khÃ´ng cÃ³ stream_uid > 24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: stuckRows } = await admin
    .from('live_replays')
    .update({
      archive_status: 'unrecoverable',
      archive_error: 'stuck in concat/ingest > 24h (Stream /copy or webm concat failed permanently)',
      archive_next_retry_at: null,
    })
    .eq('archive_status', 'pending')
    .in('status', ['queued', 'normalizing'])
    .is('stream_uid', null)
    .lt('created_at', cutoff)
    .select('id');
  const stuck_queued = (stuckRows || []).length;

  if (chunked_failed || stuck_queued) {
    console.log('[ARCHIVE_CRON] markUnrecoverableReplays', { chunked_failed, stuck_queued });
  }
  return { chunked_failed, stuck_queued };
}

function getReconnectDeadline(signalLostAt: string, timeoutSeconds: number): string | null {
  const lostAt = Date.parse(signalLostAt);
  if (!Number.isFinite(lostAt)) return null;
  return new Date(lostAt + Math.max(0, timeoutSeconds) * 1000).toISOString();
}

function logObsSignal(params: {
  sessionId: string;
  userId: string | null;
  status: 'connected' | 'lost' | 'reconnected' | 'timeout_auto_end';
  signalLostAt: string | null;
  reconnectDeadlineAt: string | null;
  reason: string | null;
}) {
  console.log(
    `[RTMP SIGNAL] session_id=${params.sessionId} user_id=${params.userId || ''} status=${params.status} signal_lost_at=${params.signalLostAt || ''} reconnect_deadline_at=${params.reconnectDeadlineAt || ''} reason=${params.reason || ''}`,
  );
}

async function autoEndDisconnectedRtmpSessions(admin: any): Promise<number> {
  const reconnectTimeoutSeconds = getObsReconnectTimeoutSeconds();
  const { data: sessions } = await admin
    .from('live_sessions')
    .select('*')
    .eq('mode', 'rtmp_obs')
    .in('status', ['source_connected', 'ready_to_go_live', 'live', 'disconnect_grace', 'reconnecting'])
    .not('cloudflare_live_input_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(30);

  let ended = 0;
  for (const session of sessions || []) {
    let detection: any = null;
    try {
      detection = await detectRtmpLiveConnection(session, { skewSeconds: 60 });
    } catch (error) {
      console.warn('[RTMP_WATCHDOG] skip disconnect check: Cloudflare read failed', {
        live_session_id: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const connected = !!detection.connected || !!detection.videoStreaming;
    const now = new Date().toISOString();

    if (connected) {
      const reconnectingOrLegacy = session.status === 'disconnect_grace' || session.status === 'reconnecting';
      const nextStatus = reconnectingOrLegacy && (session.post_id || session.live_post_id)
        ? 'live'
        : (session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected');
      await admin.from('live_sessions').update({
        status: nextStatus,
        connection_status: 'connected',
        source_connected: true,
        last_disconnected_at: null,
        disconnected_at: null,
        signal_status: 'connected',
        signal_lost_at: null,
        reconnect_deadline_at: null,
        auto_end_reason: null,
        live_input_status: detection.videoStreaming ? 'live' : 'input_connected_no_video',
        updated_at: now,
      }).eq('id', session.id);
      logObsSignal({
        sessionId: session.id,
        userId: session.owner_id || session.host_user_id || session.user_id || null,
        status: reconnectingOrLegacy ? 'reconnected' : 'connected',
        signalLostAt: null,
        reconnectDeadlineAt: null,
        reason: 'obs_signal_restored',
      });
      continue;
    }

    // API lỗi hoặc state không nhận diện được không được khởi động/tiếp tục bộ đếm tự kết thúc.
    if (!detection.confirmedDisconnected || detection.reason === 'cloudflare_soft_fail' || detection.reason === 'unknown_input_state' || detection.errors?.length) {
      await admin.from('live_sessions').update({ last_connection_check_at: now }).eq('id', session.id);
      continue;
    }

    const lastDisconnectedAt = session.last_disconnected_at || now;
    const signalLostAt = session.signal_lost_at || lastDisconnectedAt;
    const reconnectDeadlineAt = session.reconnect_deadline_at || getReconnectDeadline(signalLostAt, reconnectTimeoutSeconds);
    const reconnectExpired = !!reconnectDeadlineAt && Date.now() >= Date.parse(reconnectDeadlineAt);
    if (reconnectExpired) {
      let recheck: any = null;
      try {
        recheck = await detectRtmpLiveConnection(session, { skewSeconds: 60 });
      } catch (error) {
        console.warn('[RTMP_WATCHDOG] skip auto-end: final Cloudflare recheck failed', { live_session_id: session.id });
        continue;
      }
      if (recheck.inputConnected || recheck.videoStreaming) {
        const nextStatus = (session.post_id || session.live_post_id)
          ? 'live'
          : (session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected');
        await admin.from('live_sessions').update({
          status: nextStatus,
          connection_status: 'connected',
          source_connected: true,
          last_disconnected_at: null,
          disconnected_at: null,
          signal_status: 'connected',
          signal_lost_at: null,
          reconnect_deadline_at: null,
          auto_end_reason: null,
          live_input_status: recheck.videoStreaming ? 'live' : 'input_connected_no_video',
          last_connection_check_at: now,
          updated_at: now,
        }).eq('id', session.id);
        continue;
      }
      if (!recheck.confirmedDisconnected || recheck.errors?.length || recheck.reason === 'cloudflare_soft_fail' || recheck.reason === 'unknown_input_state') {
        console.log('[RTMP_WATCHDOG] skip auto-end: Cloudflare disconnect not confirmed', { live_session_id: session.id, reason: recheck.reason });
        continue;
      }
    }
    await admin.from('live_sessions').update({
      status: reconnectExpired ? 'ended' : 'reconnecting',
      connection_status: reconnectExpired ? 'ended' : 'reconnecting',
      source_connected: false,
      last_disconnected_at: lastDisconnectedAt,
      disconnected_at: lastDisconnectedAt,
      signal_status: reconnectExpired ? 'timeout_auto_end' : 'lost',
      signal_lost_at: signalLostAt,
      reconnect_deadline_at: reconnectExpired ? null : reconnectDeadlineAt,
      auto_end_reason: reconnectExpired ? 'obs_signal_lost_timeout' : session.auto_end_reason || null,
      live_input_status: reconnectExpired ? 'ended' : 'waiting_reconnect',
      updated_at: now,
    }).eq('id', session.id);

    logObsSignal({
      sessionId: session.id,
      userId: session.owner_id || session.host_user_id || session.user_id || null,
      status: reconnectExpired ? 'timeout_auto_end' : 'lost',
      signalLostAt,
      reconnectDeadlineAt: reconnectExpired ? null : reconnectDeadlineAt,
      reason: reconnectExpired ? 'obs_signal_lost_timeout' : 'obs_signal_lost_detected',
    });

    if (!reconnectExpired) continue;

    // Re-check ngay tru?c khi end: n?u Cloudflare báo còn liveVideo active ? reset, KHÔNG end nh?m.
    let recheck: any = null;
    try {
      recheck = await detectRtmpLiveConnection(session, { skewSeconds: 60 });
    } catch (error) {
      console.warn('[RTMP_WATCHDOG] cancel end: final Cloudflare recheck failed', {
        live_session_id: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (recheck.connected || recheck.videoStreaming) {
      console.log('[RTMP_WATCHDOG] cancel end (recheck shows connected)', { live_session_id: session.id, reason: recheck.reason });
      const reconnectedPublicLive = session.status === 'disconnect_grace' || session.status === 'reconnecting';
      await admin.from('live_sessions').update({
        status: reconnectedPublicLive && (session.post_id || session.live_post_id)
          ? 'live'
          : (session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected'),
        connection_status: 'connected',
        source_connected: true,
        last_disconnected_at: null,
        disconnected_at: null,
        signal_status: 'connected',
        signal_lost_at: null,
        reconnect_deadline_at: null,
        auto_end_reason: null,
        live_input_status: recheck.videoStreaming ? 'live' : 'input_connected_no_video',
        updated_at: new Date().toISOString(),
      }).eq('id', session.id);
      continue;
    }
    if (!recheck.confirmedDisconnected || recheck.errors?.length || recheck.reason === 'cloudflare_soft_fail' || recheck.reason === 'unknown_input_state') continue;

    await endRtmpLiveSession(admin, { ...session, last_disconnected_at: lastDisconnectedAt, signal_lost_at: signalLostAt, reconnect_deadline_at: reconnectDeadlineAt }, 'obs_signal_lost_timeout');
    ended += 1;
  }

  return ended;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { replay_id, limit = 5, cleanup_limit = 10 } = await req.json().catch(() => ({}));
  const auto_ended_rtmp_sessions = await autoEndDisconnectedRtmpSessions(admin as any);
  const recovered_rtmp_replays = await recoverMissingRtmpReplays(admin as any);
  const marked_unrecoverable = await markUnrecoverableReplays(admin as any).catch((e) => {
    console.warn('[ARCHIVE_CRON] markUnrecoverableReplays failed', String(e));
    return { chunked_failed: 0, stuck_queued: 0 };
  });
  const cleanup_archived_stream_videos = await cleanupArchivedStreamVideos(admin as any, cleanup_limit).catch((error) => ({
    scanned: 0,
    deleted: 0,
    skipped: 0,
    failed: 1,
    results: [{ status: 'cleanup_failed', error: error instanceof Error ? error.message : String(error) }],
  }));

  let replays: any[] = [];
  if (replay_id) {
    const { data } = await (admin as any)
      .from('live_replays')
      .select('id')
      .eq('id', replay_id)
      .limit(1);
    replays = data || [];
  } else {
    const nowIso = new Date().toISOString();
    const staleIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Bucket A â€” replays cáº§n archive tháº­t sá»± (pending / failed / Ä‘ang cháº¡y bá»‹ treo / Ä‘ang á»Ÿ giá»¯a state machine).
    const { data: bucketA } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id, archive_status, archive_phase, archive_attempts, archive_next_retry_at, archive_lease_until, updated_at, replay_post_id, stream_deleted_at, duration_seconds, mp4_total_bytes, multipart_bytes_done')
      .eq('cloudflare_vod_enabled', true)
      .not('stream_uid', 'is', null)
      .in('status', ['ready', 'processing'])
      .or([
        'archive_status.is.null',
        'archive_status.in.(pending,failed,archiving,processing_stream,stream_ready,exporting_mp4,uploading_r2,verifying_r2)',
        'archive_phase.in.(mp4_export,mp4_wait,multipart_init,multipart_upload,verifying,posting,deleting_stream)',
      ].join(','))
      .or(`archive_lease_until.is.null,archive_lease_until.lt.${nowIso}`)
      .order('updated_at', { ascending: true })
      .limit(40);

    // Bucket B â€” finalize stuck 'archived' (thiáº¿u replay_post_id hoáº·c chÆ°a xoÃ¡ Stream).
    const { data: bucketB } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id, archive_status, archive_phase, archive_attempts, archive_next_retry_at, archive_lease_until, updated_at, replay_post_id, stream_deleted_at, duration_seconds, mp4_total_bytes, multipart_bytes_done')
      .eq('cloudflare_vod_enabled', true)
      .not('stream_uid', 'is', null)
      .in('status', ['ready', 'processing'])
      .eq('archive_status', 'archived')
      .or('replay_post_id.is.null,stream_deleted_at.is.null')
      .lt('updated_at', staleIso)
      .order('updated_at', { ascending: true })
      .limit(15);

    const data = [...(bucketA || []), ...(bucketB || [])];

    // Fetch modes to apply per-mode attempts cap (RTMP needs longer, MP4 transcode is slow)
    const sessionIds = Array.from(new Set(data.map((r: any) => r.live_session_id).filter(Boolean)));
    const modeBySession = new Map<string, string>();
    if (sessionIds.length) {
      const { data: sess } = await (admin as any)
        .from('live_sessions').select('id, mode').in('id', sessionIds);
      for (const s of sess || []) modeBySession.set(s.id, s.mode);
    }
    replays = data
      .filter((row: any) => {
        const mode = modeBySession.get(row.live_session_id) || 'agora_webcam';
        const cap = mode === 'rtmp_obs' ? 16 : 8;
        const attempts = Number(row.archive_attempts || 0);
        const activePhase = [
          'mp4_export',
          'mp4_wait',
          'multipart_init',
          'multipart_upload',
          'verifying',
          'posting',
          'deleting_stream',
        ].includes(String(row.archive_phase || ''));
        const recoverableStatus = [
          'stream_ready',
          'exporting_mp4',
          'uploading_r2',
          'verifying_r2',
        ].includes(String(row.archive_status || ''));
        const totalBytes = Number(row.mp4_total_bytes || 0);
        const bytesDone = Number(row.multipart_bytes_done || 0);
        const progressPct = totalBytes > 0 ? Math.round((bytesDone / totalBytes) * 100) : 0;
        const leaseFree = !row.archive_lease_until || String(row.archive_lease_until) <= nowIso;
        const stuckAt99 = progressPct >= 99
          && ['verifying', 'posting'].includes(String(row.archive_phase || ''))
          && leaseFree;
        const isStalePending = row.archive_status === 'pending'
          && (!row.updated_at || row.updated_at <= staleIso)
          && (!row.archive_next_retry_at || row.archive_next_retry_at <= nowIso);
        if (stuckAt99) return true;
        if (activePhase) {
          return !row.archive_next_retry_at || row.archive_next_retry_at <= nowIso;
        }
        if (attempts >= cap && !isStalePending && !recoverableStatus) return false;
        if (!row.archive_status || row.archive_status === 'pending') return true;
        if (row.archive_status === 'failed') {
          return !row.archive_next_retry_at || row.archive_next_retry_at <= nowIso;
        }
        if (['archiving', 'processing_stream', 'stream_ready', 'exporting_mp4', 'uploading_r2', 'verifying_r2'].includes(row.archive_status)) {
          return row.updated_at && row.updated_at <= staleIso;
        }
        if (row.archive_status === 'archived') {
          return row.updated_at && row.updated_at <= staleIso
            && (!(row as any).replay_post_id || !(row as any).stream_deleted_at);
        }
        return false;
      })
      .sort((a: any, b: any) => {
        const aLong = Number(a.duration_seconds || 0) >= 3600 || Number(a.mp4_total_bytes || 0) >= 1024 * 1024 * 1024;
        const bLong = Number(b.duration_seconds || 0) >= 3600 || Number(b.mp4_total_bytes || 0) >= 1024 * 1024 * 1024;
        const aActive = ['mp4_wait', 'multipart_init', 'multipart_upload', 'verifying', 'posting'].includes(String(a.archive_phase || ''));
        const bActive = ['mp4_wait', 'multipart_init', 'multipart_upload', 'verifying', 'posting'].includes(String(b.archive_phase || ''));
        if (aLong !== bLong) return aLong ? -1 : 1;
        if (aActive !== bActive) return aActive ? -1 : 1;
        // V2 tie-break: replay Ä‘Ã£ upload nhiá»u bytes hÆ¡n (sáº¯p xong) Ä‘Æ°á»£c Æ°u tiÃªn trÆ°á»›c
        const aBytes = Number(a.multipart_bytes_done || 0);
        const bBytes = Number(b.multipart_bytes_done || 0);
        if (aBytes !== bBytes) return bBytes - aBytes;
        return new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime();
      })
      .slice(0, Math.min(Number(limit) || 5, 10));
    if (replays.length === 0) {
      console.log('[ARCHIVE_CRON] no eligible replays', { scanned_a: (bucketA || []).length, scanned_b: (bucketB || []).length });
    } else {
      console.log('[ARCHIVE_CRON] picked', { count: replays.length, scanned_a: (bucketA || []).length, scanned_b: (bucketB || []).length });
    }
  }

  const results: any[] = [];
  for (const replay of replays) {
    try {
      // Re-check live_session.status right before archiving to avoid clobbering an active live
      const { data: replayRow } = await (admin as any)
        .from('live_replays').select('live_session_id, archive_phase, status').eq('id', replay.id).maybeSingle();
      if (replayRow?.live_session_id) {
        const { data: sess } = await (admin as any)
          .from('live_sessions').select('status, ended_at').eq('id', replayRow.live_session_id).maybeSingle();
        if (sess?.status === 'live' && !sess?.ended_at) {
          results.push({ ok: true, replay_id: replay.id, status: 'skipped_live_in_progress' });
          continue;
        }
        if (sess?.status === 'live' && sess?.ended_at && replayRow?.status === 'ready') {
          await (admin as any).from('live_sessions').update({
            status: 'replay_temp_ready',
            archive_status: 'pending',
            updated_at: new Date().toISOString(),
          }).eq('id', replayRow.live_session_id);
        }
      }
      if (replayRow?.archive_phase === 'mp4_wait') {
        results.push(await pollMp4ForReplay(admin, replay.id));
        continue;
      }
      results.push(await archiveReplay(admin, replay.id));
    } catch (error) {
      results.push({
        ok: false,
        replay_id: replay.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return json({
    ok: true,
    auto_ended_rtmp_sessions,
    recovered_rtmp_replays,
    marked_unrecoverable,
    cleanup_archived_stream_videos,
    processed: results.length,
    results,
  });
});


