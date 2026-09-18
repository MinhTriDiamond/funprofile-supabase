/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, HttpError, json, normalizeError, requireUser } from '../_shared/httpAuth.ts';
import {
  acquireRecording,
  buildRecordingUid,
  buildRtcToken,
  resolveRecordingLayout,
  startRecording,
} from '../_shared/agoraCloudRecordingService.ts';
import { uuidToAgoraNumericUid } from '../_shared/agoraService.ts';

function getAgoraActiveRecordingLimit(): number {
  const raw = Number(Deno.env.get('AGORA_CLOUD_RECORDING_MAX_ACTIVE') || 20);
  return Number.isFinite(raw) && raw >= 0 ? raw : 20;
}

function normalizeRecordingError(error: unknown): { code: string; message: string; raw?: unknown } {
  const anyErr = error as { status?: number; message?: string; raw?: string; code?: string };
  const rawText = `${anyErr?.message || ''} ${anyErr?.raw || ''}`.toLowerCase();
  let code = anyErr?.code || 'AGORA_RECORDING_START_FAILED';
  if (anyErr?.status) code = `AGORA_HTTP_${anyErr.status}`;
  if (rawText.includes('quota') || rawText.includes('pcw')) code = 'AGORA_PCW_LIMIT';
  if (rawText.includes('resource') && rawText.includes('limit')) code = 'AGORA_RECORDING_RESOURCE_LIMIT';
  return {
    code,
    message: anyErr?.message || anyErr?.raw || (error instanceof Error ? error.message : String(error)),
    raw: anyErr?.raw || error,
  };
}

async function markBrowserFallback(admin: any, input: {
  sessionId: string;
  postId?: string | null;
  code: string;
  message: string;
  source: string;
  raw?: unknown;
}) {
  await admin.from('live_sessions').update({
    recording_provider: 'browser',
    recording_status: 'failed',
    recording_error_code: input.code,
    recording_error_message: input.message,
    recording_error: input.message,
    browser_recording_status: 'idle',
    browser_recording_warning: 'Browser fallback recommended',
    updated_at: new Date().toISOString(),
  }).eq('id', input.sessionId);

  if (input.postId) {
    const { data: post } = await admin.from('posts').select('metadata').eq('id', input.postId).maybeSingle();
    await admin.from('posts').update({
      metadata: {
        ...(post?.metadata || {}),
        recording_provider: 'browser',
        replay_status: 'fallback_browser_pending',
        recording_error_code: input.code,
        fallback_recording_recommended: true,
      },
    }).eq('id', input.postId).then(undefined, () => undefined);
  }

  await admin.from('live_session_events').insert({
    live_session_id: input.sessionId,
    reason: 'browser_recording_fallback_recommended',
    source: 'live-recording-start',
    payload: {
      code: input.code,
      message: input.message,
      source: input.source,
      timestamp: new Date().toISOString(),
    },
  }).then(undefined, () => undefined);

  console.warn('[live-recording-start] Agora recording fallback recommended', input);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient() as any;

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const sessionId = body.live_session_id || body.liveSessionId || body.session_id || body.sessionId;
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpError(400, 'MISSING_SESSION_ID', 'Missing live_session_id');
    }

    const { data: session, error: sessionError } = await admin
      .from('live_sessions')
      .select(`
        id, host_user_id, user_id, owner_id, post_id, live_post_id, status, mode,
        agora_channel, agora_channel_name, channel_name, agora_uid, agora_uid_host,
        recording_uid, recording_status, recording_layout, temp_bucket
      `)
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new HttpError(404, 'LIVE_SESSION_NOT_FOUND', 'Live session not found');
    if (![session.host_user_id, session.user_id, session.owner_id].includes(user.id)) {
      throw new HttpError(403, 'FORBIDDEN', 'Only the live host can start recording');
    }
    if (session.recording_status === 'recording') {
      return json({
        recordingAvailable: true,
        fallbackRecordingRecommended: false,
        recording: { uid: session.recording_uid },
      });
    }

    const { count: activeRecordingCount, error: activeCountError } = await admin
      .from('live_sessions')
      .select('id', { count: 'exact', head: true })
      .in('recording_status', ['starting', 'recording']);
    if (activeCountError) console.warn('[live-recording-start] active recording count failed', activeCountError);

    const maxActiveRecordings = getAgoraActiveRecordingLimit();
    if ((activeRecordingCount || 0) >= maxActiveRecordings) {
      const code = 'AGORA_PCW_LIMIT_LOCAL_GUARD';
      await markBrowserFallback(admin, {
        sessionId,
        postId: session.post_id || session.live_post_id,
        code,
        message: `Agora Cloud Recording active count ${activeRecordingCount || 0} reached local limit ${maxActiveRecordings}`,
        source: 'quota_guard',
      });
      return json({
        recordingAvailable: false,
        fallbackRecordingRecommended: true,
        fallbackProvider: 'browser',
        recordingErrorCode: code,
      });
    }

    const channel = session.agora_channel_name || session.agora_channel || session.channel_name;
    const hostUid = Number(session.agora_uid_host || session.agora_uid || uuidToAgoraNumericUid(user.id));
    const recordingUid = Number(session.recording_uid || buildRecordingUid(sessionId, hostUid));
    const tempBucket = session.temp_bucket || Deno.env.get('R2_TEMP_BUCKET') || Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '';
    const quality = body.quality === '480p' || body.quality === '720p' || body.quality === '1080p' ? body.quality : '720p';
    const layout = resolveRecordingLayout(session.recording_layout || body.recordingLayout, quality);
    const storagePrefix = `agora-temp/${user.id}/${sessionId}`;

    try {
      console.info('[live-recording-start] starting Agora Cloud Recording', {
        channelName: channel,
        liveSessionId: sessionId,
        recordingUid,
        streamTypes: 2,
        subscribeVideoUids: ['#allstream#'],
        subscribeAudioUids: ['#allstream#'],
        storagePath: `${tempBucket}/${storagePrefix}`,
      });

      const acquired = await acquireRecording(channel, recordingUid);
      const resourceId = acquired.resourceId || acquired.resource_id || null;
      if (!resourceId) throw new Error('Agora acquire did not return resourceId');

      await admin.from('live_sessions').update({
        recording_uid: recordingUid,
        recording_resource_id: resourceId,
        resource_id: resourceId,
        recording_status: 'starting',
        recording_acquired_at: new Date().toISOString(),
        recording_provider: 'agora',
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId);

      const recorderToken = buildRtcToken(channel, recordingUid, 'subscriber');
      const started = await startRecording({
        resourceId,
        channel,
        uid: recordingUid,
        token: recorderToken.token,
        userId: user.id,
        sessionId,
        tempBucket,
        quality,
        recordingLayout: layout.layout,
      });
      const sid = started.sid || null;
      if (!sid) throw new Error('Agora start did not return sid');

      await admin.from('live_sessions').update({
        recording_sid: sid,
        sid,
        recording_started_at: new Date().toISOString(),
        recording_status: 'recording',
        recording_provider: 'agora',
        recording_error_code: null,
        recording_error_message: null,
        last_worker_response: started,
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId);

      return json({
        recordingAvailable: true,
        fallbackRecordingRecommended: false,
        recording: { resourceId, sid, uid: recordingUid },
      });
    } catch (recordingError) {
      const recError = normalizeRecordingError(recordingError);
      console.error('[live-recording-start] Agora error response', {
        channelName: channel,
        liveSessionId: sessionId,
        recordingUid,
        streamTypes: 2,
        subscribeVideoUids: ['#allstream#'],
        subscribeAudioUids: ['#allstream#'],
        storagePath: `${tempBucket}/${storagePrefix}`,
        error: recError.raw,
      });
      await markBrowserFallback(admin, {
        sessionId,
        postId: session.post_id || session.live_post_id,
        code: recError.code,
        message: recError.message,
        source: 'agora_start_failure',
        raw: recError.raw,
      });
      return json({
        recordingAvailable: false,
        fallbackRecordingRecommended: true,
        fallbackProvider: 'browser',
        recordingErrorCode: recError.code,
      });
    }
  } catch (error) {
    const normalized = normalizeError(error);
    console.error('[live-recording-start] failed', normalized);
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: normalized.message, code: normalized.code || 'LIVE_RECORDING_START_FAILED' }, status);
  }
});
