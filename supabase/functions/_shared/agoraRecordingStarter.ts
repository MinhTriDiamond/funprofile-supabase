/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  acquireRecording,
  buildRecordingUid,
  buildRtcToken,
  queryRecording,
  resolveRecordingLayout,
  startRecording,
} from './agoraCloudRecordingService.ts';
import { uuidToAgoraNumericUid } from './agoraService.ts';

function normalizeRecordingError(error: unknown): { code: string; message: string; raw?: unknown; credentialsSuspect: boolean } {
  const anyErr = error as { status?: number; message?: string; raw?: string; code?: string };
  const rawText = `${anyErr?.message || ''} ${anyErr?.raw || ''}`.toLowerCase();
  let code = anyErr?.code || 'AGORA_RECORDING_START_FAILED';
  if (anyErr?.status) code = `AGORA_HTTP_${anyErr.status}`;
  if (rawText.includes('quota') || rawText.includes('pcw')) code = 'AGORA_PCW_LIMIT';
  if (rawText.includes('resource') && rawText.includes('limit')) code = 'AGORA_RECORDING_RESOURCE_LIMIT';
  // Detect credential-related failures: `invalid_appid` = AGORA_APP_ID does
  // not match AGORA_CUSTOMER_ID/SECRET pair, or Cloud Recording disabled on
  // that Agora project. 401/403 = REST auth rejected.
  const credentialsSuspect =
    rawText.includes('invalid_appid')
    || rawText.includes('invalid appid')
    || rawText.includes('invalid_customer_id')
    || rawText.includes('invalid customer id')
    || rawText.includes('unauthorized')
    || anyErr?.status === 401
    || anyErr?.status === 403;
  if (credentialsSuspect && rawText.includes('invalid_appid')) code = 'AGORA_INVALID_APPID';
  else if (credentialsSuspect && code === 'AGORA_RECORDING_START_FAILED') code = 'AGORA_CREDENTIALS_INVALID';
  return {
    code,
    message: anyErr?.message || anyErr?.raw || (error instanceof Error ? error.message : String(error)),
    raw: anyErr?.raw || error,
    credentialsSuspect,
  };
}

async function notifyAdminsCredentialsFailure(admin: any, sessionId: string, errCode: string, errMsg: string) {
  try {
    const { data: admins } = await admin.from('user_roles').select('user_id').eq('role', 'admin');
    const ids: string[] = (admins || []).map((r: any) => r.user_id).filter(Boolean);
    if (ids.length === 0) return;
    const rows = ids.map((uid) => ({
      user_id: uid,
      type: 'system',
      title: 'Agora Cloud Recording loi credentials',
      message: `Phien live ${sessionId} khong ghi duoc (${errCode}: ${errMsg}). Kiem tra AGORA_APP_ID + AGORA_CUSTOMER_ID/SECRET.`,
      metadata: { kind: 'agora_recording_invalid_appid', session_id: sessionId, code: errCode },
      read: false,
    }));
    await admin.from('notifications').insert(rows);
  } catch (err) {
    console.warn('[agoraRecordingStarter] notifyAdminsCredentialsFailure failed', err);
  }
}

async function logEvent(admin: any, sessionId: string, source: string, event: string, payload: Record<string, unknown>) {
  await admin.from('live_session_events').insert({
    live_session_id: sessionId,
    reason: event,
    source,
    payload: { ...payload, timestamp: new Date().toISOString() },
  }).then(undefined, () => undefined);
}

function browserFallbackEnabled(): boolean {
  return (Deno.env.get('ENABLE_BROWSER_RECORDER_FALLBACK') || 'false').toLowerCase() === 'true';
}

export async function ensureAgoraRecordingStarted(
  admin: any,
  liveSessionId: string,
  input: { source?: string; maxAttempts?: number } = {},
): Promise<{
  ok: boolean;
  skipped?: boolean;
  status?: string | null;
  resourceId?: string | null;
  sid?: string | null;
  errorCode?: string;
  errorMessage?: string;
}> {
  const source = input.source || 'agora-recording-starter';
  const maxAttempts = Math.max(1, input.maxAttempts || 2);

  const { data: session, error: sessionError } = await admin
    .from('live_sessions')
    .select('*')
    .eq('id', liveSessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) throw new Error('LIVE_SESSION_NOT_FOUND');
  if (session.mode && session.mode !== 'agora_webcam') {
    return { ok: true, skipped: true, status: session.recording_status || null };
  }
  if (!['live', 'reconnecting'].includes(session.status)) {
    return { ok: true, skipped: true, status: session.recording_status || null };
  }
  if (session.recording_resource_id && session.recording_sid) {
    return {
      ok: true,
      skipped: true,
      status: session.recording_status || null,
      resourceId: session.recording_resource_id,
      sid: session.recording_sid,
    };
  }
  if (['starting', 'recording', 'stopping', 'stopped', 'ready'].includes(session.recording_status)) {
    return { ok: true, skipped: true, status: session.recording_status || null };
  }

  const sessionId = session.id as string;
  const userId = session.host_user_id || session.user_id || session.owner_id;
  const channel = session.agora_channel || session.agora_channel_name || session.channel_name;
  if (!userId || !channel) throw new Error('LIVE_SESSION_MISSING_AGORA_CHANNEL');

  const hostUid = Number(session.agora_uid_host || session.agora_uid || uuidToAgoraNumericUid(userId));
  const recordingUid = Number(session.recording_uid || buildRecordingUid(sessionId, hostUid));
  const tempBucket = session.temp_bucket || Deno.env.get('R2_TEMP_BUCKET') || Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '';
  const quality = session.quality || '720p';
  const layout = resolveRecordingLayout(session.recording_layout, quality);
  const now = new Date().toISOString();

  await admin.from('live_sessions').update({
    recording_provider: 'agora',
    recording_uid: recordingUid,
    recording_status: 'acquiring',
    browser_recording_status: 'idle',
    updated_at: now,
  }).eq('id', sessionId);
  await logEvent(admin, sessionId, source, 'recording_start_queued', {
    channel_name: channel,
    recording_uid: recordingUid,
    layout: layout.layout,
  });

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const acquired = await acquireRecording(channel, recordingUid);
      const resourceId = acquired.resourceId || acquired.resource_id || null;
      if (!resourceId) throw new Error('Agora acquire did not return resourceId');

      const acquiredAt = new Date().toISOString();
      await admin.from('live_sessions').update({
        recording_resource_id: resourceId,
        resource_id: resourceId,
        recording_status: 'starting',
        recording_acquired_at: acquiredAt,
        updated_at: acquiredAt,
      }).eq('id', sessionId);
      await logEvent(admin, sessionId, source, 'recording_acquire', {
        attempt,
        resource_id: resourceId,
        response: acquired,
      });

      const recorderToken = buildRtcToken(channel, recordingUid, 'subscriber');
      const started = await startRecording({
        resourceId,
        channel,
        uid: recordingUid,
        token: recorderToken.token,
        userId,
        sessionId,
        tempBucket,
        quality,
        recordingLayout: layout.layout,
      });
      const sid = started.sid || null;
      if (!sid) throw new Error('Agora start did not return sid');

      const startedAt = new Date().toISOString();
      await admin.from('live_sessions').update({
        recording_sid: sid,
        sid,
        recording_started_at: startedAt,
        recording_status: 'recording',
        recording_provider: 'agora',
        last_worker_response: started,
        updated_at: startedAt,
      }).eq('id', sessionId);
      await admin.from('live_recordings').insert({
        live_session_id: sessionId,
        status: 'recording',
        provider: 'agora_cloud_recording',
        recording_id: sid,
        playback_url: null,
        metadata: { resource_id: resourceId, sid, uid: recordingUid, source },
      }).then(undefined, () => undefined);
      await logEvent(admin, sessionId, source, 'recording_start', {
        attempt,
        resource_id: resourceId,
        sid,
        recording_uid: recordingUid,
        response: started,
      });

      const queriedAt = new Date().toISOString();
      try {
        const queryResponse = await queryRecording(resourceId, sid, channel, recordingUid);
        await admin.from('live_sessions').update({
          recording_last_query_at: queriedAt,
          last_worker_response: queryResponse,
          last_agora_query_response: queryResponse,
          updated_at: queriedAt,
        }).eq('id', sessionId);
        await logEvent(admin, sessionId, source, 'recording_query_ok', {
          resource_id: resourceId,
          sid,
          recording_uid: recordingUid,
          response: queryResponse,
        });
      } catch (queryError) {
        const message = queryError instanceof Error ? queryError.message : String(queryError);
        await admin.from('live_sessions').update({
          recording_last_query_at: queriedAt,
          recording_error_message: message,
          updated_at: queriedAt,
        }).eq('id', sessionId);
        await logEvent(admin, sessionId, source, 'recording_query_failed', {
          resource_id: resourceId,
          sid,
          recording_uid: recordingUid,
          error: message,
        });
      }

      return { ok: true, status: 'recording', resourceId, sid };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt * attempt));
      }
    }
  }

  const recError = normalizeRecordingError(lastError);
  const failedAt = new Date().toISOString();
  const nextStatus = recError.credentialsSuspect ? 'failed_credentials' : 'failed';
  await admin.from('live_sessions').update({
    recording_provider: 'agora',
    recording_status: nextStatus,
    recording_error_code: recError.code,
    recording_error_message: recError.message,
    recording_error: recError.message,
    browser_recording_status: 'idle',
    browser_recording_warning: browserFallbackEnabled() ? 'Browser fallback disabled in stability phase' : null,
    updated_at: failedAt,
  }).eq('id', sessionId);
  await logEvent(admin, sessionId, source, 'recording_failed', {
    code: recError.code,
    message: recError.message,
    raw: recError.raw,
    credentials_suspect: recError.credentialsSuspect,
  });
  console.error('[agoraRecordingStarter] recording failed', {
    liveSessionId: sessionId,
    code: recError.code,
    message: recError.message,
    source,
    credentialsSuspect: recError.credentialsSuspect,
    raw: recError.raw,
  });

  if (recError.credentialsSuspect) {
    await notifyAdminsCredentialsFailure(admin, sessionId, recError.code, recError.message);
  }

  return {
    ok: false,
    status: nextStatus,
    errorCode: recError.code,
    errorMessage: recError.message,
  };
}
