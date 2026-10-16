/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { endRtmpLiveSession } from './rtmpEndLiveService.ts';
import { shouldLogIdempotentReturn } from './liveWatchdogIdempotency.ts';


export type LiveEndReason =
  | 'host_clicked_end'
  | 'host_heartbeat_timeout'
  | 'host_disconnected_timeout'
  | 'zombie_cleanup'
  | 'beforeunload_end_attempt'
  | 'logout'
  | 'route_change'
  | 'admin_force'
  | string;

interface ForceEndOptions {
  actorUserId?: string | null;
  source?: string;
}

interface AgoraStopResult {
  attempted: boolean;
  stopped: boolean;
  notFound: boolean;
  attempts: number;
  error: string | null;
  response: unknown;
}

const TERMINAL_RECORDING_STATUSES = new Set(['stopped', 'ready', 'failed']);
const FORCE_END_TERMINAL_STATUSES = new Set(['recording_processing', 'ended', 'recording_failed']);
const ACTIVE_HOST_DISCONNECT_TIMEOUT_MS = 60_000;
const ENDING_RETRY_TIMEOUT_MS = 120_000;
const ACTIVE_STATUSES = new Set([
  'live',
  'reconnecting',
  'starting',
  'created',
  'recording',
  'ending',
  'recording_processing',
  'processing',
  'processing_replay',
]);

function waitUntil(promise: Promise<unknown>) {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === 'function') {
    runtime.waitUntil(promise);
    return;
  }
  promise.catch((error) => {
    console.warn('[liveEndService] background task failed', readMessage(error));
  });
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isNotFoundStatus(status: number, body: string) {
  const lower = body.toLowerCase();
  return status === 404 || lower.includes('not found') || lower.includes('404') || lower.includes('invalid sid');
}

function basicAuthHeader() {
  const customerId = Deno.env.get('AGORA_CUSTOMER_ID') || Deno.env.get('AGORA_REST_KEY');
  const customerSecret = Deno.env.get('AGORA_CUSTOMER_SECRET') || Deno.env.get('AGORA_REST_SECRET');
  if (!customerId || !customerSecret) return null;
  return `Basic ${btoa(`${customerId}:${customerSecret}`)}`;
}

async function logLiveEvent(
  admin: SupabaseClient,
  session: any,
  reason: string,
  payload: Record<string, unknown> = {},
  toStatus?: string | null,
) {
  const eventPayload = {
    live_session_id: session?.id,
    host_user_id: session?.host_user_id || session?.owner_id || null,
    channel_name: session?.agora_channel_name || session?.agora_channel || session?.channel_name || null,
    resource_id: session?.recording_resource_id || session?.resource_id || null,
    sid: session?.recording_sid || session?.sid || null,
    reason: payload.reason || reason,
    timestamp: nowIso(),
    ...payload,
  };

  console.log(`[${reason}]`, eventPayload);
  await (admin as any).from('live_session_events').insert({
    live_session_id: session.id,
    from_status: session.status || null,
    to_status: toStatus ?? null,
    source: String(payload.source || 'system'),
    reason,
    payload: eventPayload,
  }).then(undefined, (error: unknown) => {
    console.warn('[liveEndService] live_session_events insert failed', readMessage(error));
  });
}

async function stopAgoraCloudRecording(admin: SupabaseClient, session: any, reason: string): Promise<AgoraStopResult> {
  const resourceId = session.recording_resource_id || session.resource_id || null;
  const sid = session.recording_sid || session.sid || null;
  const appId = Deno.env.get('AGORA_APP_ID');
  const auth = basicAuthHeader();
  const channel = session.agora_channel_name || session.agora_channel || session.channel_name;
  const uid = session.recording_uid ? String(session.recording_uid) : undefined;

  if (!resourceId || !sid) {
    await logLiveEvent(admin, session, 'cloud_recording_stop_skipped', {
      reason,
      source: 'force_end_live',
      warning: 'missing_resource_id_or_sid',
    });
    return { attempted: false, stopped: true, notFound: false, attempts: 0, error: null, response: null };
  }

  if (!appId || !auth) {
    const error = 'Agora Cloud Recording credentials are not configured';
    await logLiveEvent(admin, session, 'cloud_recording_stop_failed', {
      reason,
      source: 'force_end_live',
      error,
    });
    // Đánh dấu rõ ràng để dashboard health hiển thị đỏ + ngăn các cron khác coi
    // session này còn đang ghi (root cause sự cố 14/06/2026 — Agora không flush
    // file lên R2 temp ⇒ replay_failed_no_recording).
    await (admin as any).from('live_sessions').update({
      recording_status: 'failed_credentials',
      updated_at: nowIso(),
    }).eq('id', session.id).then(undefined, () => undefined);
    return { attempted: true, stopped: false, notFound: false, attempts: 0, error, response: null };
  }

  await (admin as any).from('live_sessions').update({
    recording_status: 'stopping',
    recording_stop_requested_at: nowIso(),
    updated_at: nowIso(),
  }).eq('id', session.id);

  await logLiveEvent(admin, session, 'cloud_recording_stop_requested', {
    reason,
    source: 'force_end_live',
  });

  const url = `https://api.agora.io/v1/apps/${appId}/cloud_recording/resourceid/${encodeURIComponent(resourceId)}/sid/${encodeURIComponent(sid)}/mode/mix/stop`;
  let lastError: string | null = null;
  let lastResponse: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const body: Record<string, unknown> = {
        cname: channel,
        clientRequest: {},
      };
      if (uid) body.uid = uid;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      lastResponse = parsed;

      if (response.ok || isNotFoundStatus(response.status, text)) {
        const stoppedAt = nowIso();
        const notFound = !response.ok;
        await (admin as any).from('live_sessions').update({
          recording_status: 'stopped',
          recording_stopped_at: stoppedAt,
          recording_error: notFound ? null : session.recording_error,
          recording_last_query_at: stoppedAt,
          last_worker_response: parsed,
          updated_at: stoppedAt,
        }).eq('id', session.id);
        await (admin as any).from('live_recordings').update({
          status: 'stopped',
          stopped_at: stoppedAt,
          raw_response: parsed,
          error_message: null,
        }).eq('live_id', session.id).or(`sid.eq.${sid},resource_id.eq.${resourceId}`);
        await logLiveEvent(admin, session, 'cloud_recording_stop_success', {
          reason,
          source: 'force_end_live',
          attempt,
          not_found_treated_as_stopped: notFound,
          response: parsed,
        });
        return { attempted: true, stopped: true, notFound, attempts: attempt, error: null, response: parsed };
      }

      lastError = `Agora stop failed ${response.status}: ${text}`;
      if (response.status >= 400 && response.status < 500) break;
    } catch (error) {
      lastError = readMessage(error);
    }

    if (attempt < 3) await sleep(500 * attempt);
  }

  await (admin as any).from('live_sessions').update({
    recording_status: 'failed',
    recording_error: lastError,
    recording_last_query_at: nowIso(),
    last_worker_response: lastResponse as any,
    updated_at: nowIso(),
  }).eq('id', session.id);
  await logLiveEvent(admin, session, 'cloud_recording_stop_failed', {
    reason,
    source: 'force_end_live',
    attempts: 3,
    error: lastError,
    response: lastResponse,
  });
  return { attempted: true, stopped: false, notFound: false, attempts: 3, error: lastError, response: lastResponse };
}

async function queryAgoraCloudRecording(admin: SupabaseClient, session: any, reason: string): Promise<unknown> {
  const resourceId = session.recording_resource_id || session.resource_id || null;
  const sid = session.recording_sid || session.sid || null;
  const appId = Deno.env.get('AGORA_APP_ID');
  const auth = basicAuthHeader();
  if (!resourceId || !sid || !appId || !auth) return null;

  const url = `https://api.agora.io/v1/apps/${appId}/cloud_recording/resourceid/${encodeURIComponent(resourceId)}/sid/${encodeURIComponent(sid)}/mode/mix/query`;
  const queriedAt = nowIso();
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: auth },
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    await (admin as any).from('live_sessions').update({
      recording_last_query_at: queriedAt,
      last_worker_response: parsed,
      updated_at: queriedAt,
    }).eq('id', session.id);
    await logLiveEvent(admin, session, 'cloud_recording_query', {
      reason,
      source: 'force_end_live',
      status: response.status,
      response: parsed,
    });
    return parsed;
  } catch (error) {
    await (admin as any).from('live_sessions').update({
      recording_last_query_at: queriedAt,
      recording_error: readMessage(error),
      updated_at: queriedAt,
    }).eq('id', session.id);
    await logLiveEvent(admin, session, 'cloud_recording_query_failed', {
      reason,
      source: 'force_end_live',
      error: readMessage(error),
    });
    return null;
  }
}

async function updateLivePostEnded(admin: SupabaseClient, session: any, reason: string, endedAt: string) {
  const postId = session.post_id || session.live_post_id || null;
  const userId = session.host_user_id || session.owner_id || session.user_id || null;
  const { data: post } = postId
    ? await (admin as any).from('posts').select('metadata').eq('id', postId).maybeSingle()
    : { data: null as any };
  const metadata = post?.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)
    ? post.metadata
    : {};
  const playbackUrl = session.playback_url || session.r2_video_url || session.replay_url || null;
  const playbackProvider = session.playback_provider || null;
  const hasMp4ReplayUrl = Boolean(session.r2_video_url)
    || Boolean(playbackUrl && playbackProvider === 'r2')
    || Boolean(playbackUrl && /\.mp4(?:\?|$)/i.test(String(playbackUrl)));
  const hasTempHlsUrl = Boolean(playbackUrl)
    && !hasMp4ReplayUrl
    && (playbackProvider === 'r2_temp' || /\.m3u8(?:\?|$)/i.test(String(playbackUrl)));
  const recordingStatus = String(session.recording_status || '');
  const credentialsFailure = recordingStatus === 'failed_credentials'
    || String(session.recording_error_code || '').startsWith('AGORA_INVALID_APPID')
    || String(session.recording_error_code || '') === 'AGORA_CREDENTIALS_INVALID';
  const noRecording = recordingStatus === 'missed'
    || recordingStatus === 'failed'
    || credentialsFailure
    || session.recording_error === 'recording_never_started';
  const replayStatus = hasMp4ReplayUrl ? 'ready_mp4' : (hasTempHlsUrl ? 'ready_hls' : (noRecording ? 'failed_no_recording' : 'processing'));
  const replayReady = replayStatus === 'ready_mp4' || replayStatus === 'ready_hls';
  const processingMessage = replayStatus === 'failed_no_recording'
    ? (credentialsFailure
        ? 'He thong ghi hinh dang bao tri. Phien live van phat binh thuong nhung khong luu duoc video replay. Vui long thu lai sau it phut.'
        : 'Khong luu duoc video replay cho phien live nay.')
    : replayStatus === 'processing'
      ? 'Dang xu ly video replay...'
      : null;

  if (userId) {
    await (admin as any).from('live_replays').upsert({
      user_id: userId,
      live_session_id: session.id,
      chunked_recording_id: session.id,
      status: replayStatus === 'failed_no_recording' ? 'failed' : (replayReady ? 'ready' : 'processing'),
      replay_status: replayStatus,
      playback_type: replayStatus === 'ready_mp4' ? 'mp4' : (replayStatus === 'ready_hls' ? 'hls' : 'processing'),
      playback_hls: replayStatus === 'ready_hls' ? playbackUrl : null,
      temp_hls_url: replayStatus === 'ready_hls' ? playbackUrl : null,
      playback_mp4: replayStatus === 'ready_mp4' ? playbackUrl : null,
      r2_video_url: session.r2_video_url || (replayStatus === 'ready_mp4' ? playbackUrl : null),
      archive_mp4_url: replayStatus === 'ready_mp4' ? playbackUrl : null,
      playback_provider: replayStatus === 'ready_mp4' ? 'r2' : (replayStatus === 'ready_hls' ? 'r2_temp' : (session.playback_provider || 'r2_temp')),
      storage_provider: replayStatus === 'ready_mp4' ? 'r2' : (replayStatus === 'ready_hls' ? 'r2_temp' : (session.storage_provider || 'r2_temp')),
      archive_status: replayStatus === 'failed_no_recording' ? 'failed' : (replayStatus === 'ready_mp4' ? 'r2_ready' : 'pending'),
      error_message: replayStatus === 'failed_no_recording' ? processingMessage : null,
      updated_at: endedAt,
    }, { onConflict: 'chunked_recording_id' }).then(undefined, (error: unknown) => {
      console.warn('[liveEndService] live_replays end-state upsert failed', session.id, readMessage(error));
    });
  }

  if (postId) {
    await (admin as any).from('posts').update({
      post_type: 'live_replay',
      video_url: replayReady ? playbackUrl : null,
      metadata: {
        ...metadata,
        live_status: 'ended',
        live_mode: session.mode || 'agora_webcam',
        live_session_id: session.id,
        ended_at: endedAt,
        end_reason: reason,
        replay_status: replayStatus,
        replay_ready: replayReady,
        playback_url: playbackUrl,
        playback_hls: replayStatus === 'ready_hls' ? playbackUrl : null,
        temp_hls_url: replayStatus === 'ready_hls' ? playbackUrl : null,
        r2_video_url: replayStatus === 'ready_mp4' ? (session.r2_video_url || playbackUrl) : null,
        archive_mp4_url: replayStatus === 'ready_mp4' ? playbackUrl : null,
        playback_provider: replayStatus === 'ready_mp4' ? 'r2' : (replayStatus === 'ready_hls' ? 'r2_temp' : session.playback_provider || null),
        storage_provider: replayStatus === 'ready_mp4' ? 'r2' : (replayStatus === 'ready_hls' ? 'r2_temp' : session.storage_provider || null),
        recording_status: recordingStatus || null,
        recording_error: session.recording_error || null,
        processing_message: processingMessage,
      },
      replay_status: replayStatus,
      playback_provider: replayStatus === 'ready_mp4' ? 'r2' : (replayStatus === 'ready_hls' ? 'r2_temp' : session.playback_provider || null),
      replay_ready: replayReady,
      processing_message: processingMessage,
      updated_at: endedAt,
    }).eq('id', postId);
  }
}

async function finishUsageRows(admin: SupabaseClient, session: any, reason: string, endedAt: string) {
  await (admin as any).from('agora_usage_sessions').update({
    ended_at: endedAt,
    status: 'ended',
    end_reason: reason === 'host_heartbeat_timeout' || reason === 'host_disconnected_timeout' ? 'system_timeout' : 'user_ended',
    updated_at: endedAt,
  }).eq('live_session_id', session.id).in('status', ['connecting', 'live']);
}

async function kickWebcamRecordingProcessor(sessionId: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || Deno.env.get('CRON_SECRET');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (cronSecret) headers['X-Cron-Secret'] = cronSecret;

  const response = await fetch(`${supabaseUrl}/functions/v1/live-webcam-recording-processor`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ source: 'live_end_wait_until', session_id: sessionId, limit: 5 }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`processor kick failed ${response.status}: ${text}`);
  }
}

export function sessionNeedsForceEnd(session: any, nowMs = Date.now()) {
  if (!session) return false;
  if (session.mode === 'rtmp_obs') return false;
  if (session.status === 'ended') {
    return Boolean(
      session.recording_stopped_at == null &&
      !TERMINAL_RECORDING_STATUSES.has(String(session.recording_status || '')) &&
      (session.recording_sid || session.sid)
    );
  }
  if (!ACTIVE_STATUSES.has(String(session.status || ''))) return false;
  if (session.status === 'ending') {
    const updatedAt = new Date(session.updated_at || session.last_cleanup_at || 0).getTime();
    return !Number.isFinite(updatedAt) || nowMs - updatedAt > ENDING_RETRY_TIMEOUT_MS;
  }
  const heartbeatAt = new Date(session.last_seen_at || session.last_host_heartbeat_at || session.updated_at || session.started_at || 0).getTime();
  if (Number.isFinite(heartbeatAt) && nowMs - heartbeatAt > ACTIVE_HOST_DISCONNECT_TIMEOUT_MS) return true;
  const startedAt = new Date(session.started_at || 0).getTime();
  return Number.isFinite(startedAt) && nowMs - startedAt > 24 * 60 * 60 * 1000;
}

export async function forceEndLive(
  admin: SupabaseClient,
  liveSessionId: string,
  reason: LiveEndReason,
  options: ForceEndOptions = {},
): Promise<Record<string, unknown>> {
  const { data: session, error } = await (admin as any)
    .from('live_sessions')
    .select('*')
    .eq('id', liveSessionId)
    .maybeSingle();
  if (error) throw error;
  if (!session) return { ok: false, error: 'not_found' };

  if (session.mode === 'rtmp_obs') {
    const rtmpReason = reason === 'host_heartbeat_timeout' || reason === 'host_disconnected_timeout'
      ? 'disconnect_timeout'
      : reason === 'admin_force'
        ? 'admin_force'
        : reason === 'duration_limit' || reason === 'auto_duration_limit'
          ? 'duration_limit'
          : 'manual';
    const result = await endRtmpLiveSession(admin, session, rtmpReason as any);
    if (result.idempotent !== true) {
      await logLiveEvent(admin, session, 'live_ended_success', { reason, source: options.source || 'force_end_live', rtmp: true }, 'ended');
    }
    return { ok: true, mode: 'rtmp_obs', ...result };
  }

  if (
    FORCE_END_TERMINAL_STATUSES.has(String(session.status || '')) ||
    String(session.recording_status || '') === 'ready'
  ) {
    // B5-B: chỉ ghi log idempotent LẦN ĐẦU cho mỗi phiên, tránh vòng lặp 1 row/phút.
    const { count } = await (admin as any)
      .from('live_session_events')
      .select('id', { count: 'exact', head: true })
      .eq('live_session_id', liveSessionId)
      .eq('reason', 'force_end_idempotent_return');
    if (shouldLogIdempotentReturn(Number(count || 0))) {
      await logLiveEvent(admin, session, 'force_end_idempotent_return', {
        reason,
        source: options.source || 'force_end_live',
        status: session.status,
        recording_status: session.recording_status,
      });
    }

    return {
      ok: true,
      live_session_id: liveSessionId,
      status: session.status,
      recording_status: session.recording_status,
      ended_at: session.ended_at || null,
      duplicate: true,
      idempotent: true,
    };
  }

  if (options.actorUserId && session.host_user_id !== options.actorUserId && session.owner_id !== options.actorUserId) {
    return { ok: false, error: 'forbidden' };
  }

  if ([
    'host_clicked_end',
    'host_heartbeat_timeout',
    'host_disconnected_timeout',
    'beforeunload_end_attempt',
    'logout',
    'route_change',
  ].includes(String(reason))) {
    await logLiveEvent(admin, session, String(reason), {
      reason,
      source: options.source || 'force_end_live',
    });
  }

  await logLiveEvent(admin, session, 'force_end_started', { reason, source: options.source || 'force_end_live' }, 'ending');

  const lockTime = nowIso();
  const { data: lockedRows, error: lockErr } = await (admin as any)
    .from('live_sessions')
    .update({
      status: 'ending',
      host_connection_status: 'offline',
      end_reason: reason,
      ended_at: session.ended_at || lockTime,
      last_cleanup_at: lockTime,
      cleanup_attempts: (Number(session.cleanup_attempts || 0) + 1),
      updated_at: lockTime,
    })
    .eq('id', liveSessionId)
    .neq('status', 'ended')
    .neq('status', 'ending')
    .neq('status', 'recording_processing')
    .neq('status', 'recording_failed')
    .select('*');
  if (lockErr) throw lockErr;

  const workingSession = Array.isArray(lockedRows) && lockedRows[0] ? lockedRows[0] : session;
  const duplicate = session.status === 'ending' || (!lockedRows || lockedRows.length === 0);

  const recordingStatus = String(workingSession.recording_status || '');
  const hasRecordingIds = Boolean(workingSession.recording_resource_id || workingSession.resource_id) && Boolean(workingSession.recording_sid || workingSession.sid);
  const stopRequestedAt = new Date(workingSession.recording_stop_requested_at || workingSession.updated_at || 0).getTime();
  const stoppingIsFresh = recordingStatus === 'stopping' && Number.isFinite(stopRequestedAt) && Date.now() - stopRequestedAt < 120_000;
  let stopResult: AgoraStopResult = { attempted: false, stopped: true, notFound: false, attempts: 0, error: null, response: null };

  if (hasRecordingIds && stoppingIsFresh) {
    await logLiveEvent(admin, workingSession, 'cloud_recording_stop_skipped', {
      reason,
      source: options.source || 'force_end_live',
      warning: 'already_stopping',
    });
    return {
      ok: true,
      live_session_id: liveSessionId,
      status: 'ending',
      duplicate: true,
      recording: { attempted: false, stopped: false, notFound: false, attempts: 0, error: null, response: null },
    };
  }

  if (hasRecordingIds && !TERMINAL_RECORDING_STATUSES.has(recordingStatus) && recordingStatus !== 'stopping') {
    await queryAgoraCloudRecording(admin, workingSession, reason);
    stopResult = await stopAgoraCloudRecording(admin, workingSession, reason);
  } else if (hasRecordingIds && recordingStatus === 'stopping') {
    await queryAgoraCloudRecording(admin, workingSession, reason);
    stopResult = await stopAgoraCloudRecording(admin, workingSession, reason);
  }

  const endedAt = workingSession.ended_at || nowIso();
  const recordingProvider = workingSession.recording_provider || 'agora';
  const shouldMarkMissed = !hasRecordingIds
    && recordingProvider === 'agora'
    && !['ready', 'failed', 'missed'].includes(recordingStatus);
  const nextRecordingStatus = stopResult.stopped
    ? (hasRecordingIds ? 'stopped' : (shouldMarkMissed ? 'missed' : (workingSession.recording_status === 'ready' ? 'ready' : workingSession.recording_status || 'stopped')))
    : 'failed';
  const shouldQueueAgoraArchive = hasRecordingIds && stopResult.stopped;
  const endPatch: Record<string, unknown> = {
    status: shouldQueueAgoraArchive ? 'processing_replay' : 'ended',
    ended_at: endedAt,
    end_reason: reason,
    host_connection_status: 'offline',
    recording_status: shouldQueueAgoraArchive ? 'processing' : nextRecordingStatus,
    recording_stopped_at: shouldQueueAgoraArchive ? (workingSession.recording_stopped_at || endedAt) : workingSession.recording_stopped_at,
    recording_error: shouldMarkMissed ? 'recording_never_started' : stopResult.error,
    last_cleanup_at: nowIso(),
    updated_at: nowIso(),
  };

  if (shouldQueueAgoraArchive) {
    endPatch.archive_status = 'pending';
    endPatch.archive_retry_count = 0;
    endPatch.archive_next_retry_at = endedAt;
    endPatch.archive_error = null;
    endPatch.error_message = null;
  } else if (shouldMarkMissed) {
    endPatch.archive_status = 'unrecoverable';
    endPatch.archive_next_retry_at = null;
    endPatch.archive_error = 'recording_never_started';
  }

  await (admin as any).from('live_sessions').update(endPatch).eq('id', liveSessionId);

  await (admin as any).from('live_co_hosts').update({
    status: 'ended',
    left_at: endedAt,
  }).eq('session_id', liveSessionId).in('status', ['invited', 'accepted', 'joined', 'live']);
  await (admin as any).from('live_co_hosts').update({
    status: 'ended',
    ended_at: endedAt,
  }).eq('live_session_id', liveSessionId).in('status', ['invited', 'accepted', 'joined', 'live']).then(undefined, () => undefined);

  await updateLivePostEnded(admin, { ...workingSession, ...endPatch }, reason, endedAt);
  await finishUsageRows(admin, workingSession, reason, endedAt);
  await logLiveEvent(admin, workingSession, 'live_ended_success', {
    reason,
    source: options.source || 'force_end_live',
    duplicate,
    recording_stop_attempted: stopResult.attempted,
    recording_stopped: stopResult.stopped,
    archive_queued: shouldQueueAgoraArchive,
  }, 'ended');

  if (shouldQueueAgoraArchive) {
    waitUntil(kickWebcamRecordingProcessor(liveSessionId));
  }

  return {
    ok: true,
    live_session_id: liveSessionId,
    status: endPatch.status,
    ended_at: endedAt,
    end_reason: reason,
    duplicate,
    recording: stopResult,
  };
}
