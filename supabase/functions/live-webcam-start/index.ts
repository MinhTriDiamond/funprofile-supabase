/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, HttpError, json, normalizeError, requireUser } from '../_shared/httpAuth.ts';
import { buildAgoraChannelName, uuidToAgoraNumericUid } from '../_shared/agoraService.ts';
import {
  buildRecordingUid,
  buildRtcToken,
  resolveRecordingLayout,
} from '../_shared/agoraCloudRecordingService.ts';
import { ensureAgoraRecordingStarted } from '../_shared/agoraRecordingStarter.ts';
import { forceEndLive } from '../_shared/liveEndService.ts';

function randomSlug(attempt = 0): string {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return `live_${Date.now().toString(36)}_${suffix}${attempt ? `_${attempt + 1}` : ''}`.slice(0, 80);
}

function isSlugConflict(error: any): boolean {
  const raw = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return raw.includes('23505') || raw.includes('duplicate key') || raw.includes('posts_user_slug');
}

async function insertLivePost(admin: any, input: Record<string, unknown>): Promise<string> {
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await admin
      .from('posts')
      .insert({ ...input, slug: randomSlug(attempt) })
      .select('id')
      .single();
    if (!error && data?.id) return data.id;
    lastError = error;
    if (!isSlugConflict(error)) throw error;
  }
  throw lastError || new Error('LIVE_POST_SLUG_CONFLICT');
}

function getMissingColumnName(error: any): string | null {
  const raw = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`;
  if (!raw.includes('42703') && !/column .* does not exist/i.test(raw)) return null;
  const match = raw.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+.*does not exist/i);
  return match?.[1] || null;
}

async function insertLiveSessionWithSchemaFallback(admin: any, input: Record<string, unknown>) {
  const payload = { ...input };
  let lastError: any = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await admin.from('live_sessions').insert(payload);
    if (!error) return;

    lastError = error;
    const missingColumn = getMissingColumnName(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      delete payload[missingColumn];
      console.warn('[live-webcam-start] retrying live_sessions insert without missing column', {
        missingColumn,
        attempt: attempt + 1,
      });
      continue;
    }

    const raw = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    if (
      payload.recording_status === 'acquiring' &&
      (raw.includes('recording_status') || raw.includes('check constraint'))
    ) {
      payload.recording_status = 'idle';
      console.warn('[live-webcam-start] retrying live_sessions insert with recording_status=idle', {
        attempt: attempt + 1,
      });
      continue;
    }

    throw error;
  }

  throw lastError || new Error('LIVE_SESSION_INSERT_FAILED');
}

async function logEvent(admin: any, sessionId: string, event: string, payload: Record<string, unknown>) {
  await admin.from('live_session_events').insert({
    live_session_id: sessionId,
    reason: event,
    source: 'live-webcam-start',
    payload: { ...payload, timestamp: new Date().toISOString() },
  }).then(undefined, () => undefined);
}

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
  postId: string;
  code: string;
  message: string;
  source: string;
  raw?: unknown;
}) {
  const now = new Date().toISOString();
  await admin.from('live_sessions').update({
    recording_provider: 'browser',
    recording_status: 'failed',
    recording_error_code: input.code,
    recording_error_message: input.message,
    recording_error: input.message,
    browser_recording_status: 'idle',
    browser_recording_warning: 'Browser fallback recommended',
    updated_at: now,
  }).eq('id', input.sessionId);

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

  await logEvent(admin, input.sessionId, 'browser_recording_fallback_recommended', {
    code: input.code,
    message: input.message,
    source: input.source,
  });

  console.warn('[live-webcam-start] Agora recording fallback recommended', {
    liveSessionId: input.sessionId,
    code: input.code,
    message: input.message,
    source: input.source,
    raw: input.raw,
  });
}

function browserFallbackEnabled(): boolean {
  return (Deno.env.get('ENABLE_BROWSER_RECORDER_FALLBACK') || 'false').toLowerCase() === 'true';
}

async function markAgoraRecordingFailed(admin: any, input: {
  sessionId: string;
  postId: string;
  code: string;
  message: string;
  source: string;
  raw?: unknown;
}) {
  const now = new Date().toISOString();
  await admin.from('live_sessions').update({
    recording_provider: 'agora',
    recording_status: 'failed',
    recording_error_code: input.code,
    recording_error_message: input.message,
    recording_error: input.message,
    updated_at: now,
  }).eq('id', input.sessionId);

  const { data: post } = await admin.from('posts').select('metadata').eq('id', input.postId).maybeSingle();
  await admin.from('posts').update({
    video_url: null,
    replay_ready: false,
    replay_status: 'processing',
    processing_message: 'Video đang được xử lý',
    metadata: {
      ...(post?.metadata || {}),
      recording_provider: 'agora',
      replay_status: 'processing',
      replay_ready: false,
      recording_error_code: input.code,
      processing_message: 'Video đang được xử lý',
    },
  }).eq('id', input.postId).then(undefined, () => undefined);

  await logEvent(admin, input.sessionId, 'agora_recording_failed', {
    code: input.code,
    message: input.message,
    source: input.source,
  });

  console.error('[live-webcam-start] Agora recording failed', {
    liveSessionId: input.sessionId,
    code: input.code,
    message: input.message,
    source: input.source,
    raw: input.raw,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient() as any;
  let sessionId: string | null = null;
  let recordingUid: number | null = null;
  let channel = '';

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : '';
    const privacy = body.privacy === 'friends' || body.privacy === 'private' ? body.privacy : 'public';
    const quality = body.quality === '480p' || body.quality === '720p' || body.quality === '1080p' ? body.quality : '720p';
    const sourceDeviceType = body.deviceType === 'mobile' || body.deviceType === 'tablet' || body.deviceType === 'desktop'
      ? body.deviceType
      : 'desktop';
    const viewportOrientation = body.viewportOrientation === 'portrait' ? 'portrait' : 'landscape';
    const requestedLayout = body.recordingAspectRatio === 'portrait_9_16' ? 'portrait_9_16' : 'landscape_16_9';

    // Camera thật (do client gửi qua MediaStreamTrack.getSettings)
    const cameraWidth = Number.isFinite(body.cameraWidth) ? Number(body.cameraWidth) : 0;
    const cameraHeight = Number.isFinite(body.cameraHeight) ? Number(body.cameraHeight) : 0;
    const cameraOrientation = body.cameraOrientation === 'portrait' || body.cameraOrientation === 'landscape'
      ? body.cameraOrientation
      : (cameraWidth > 0 && cameraHeight > 0 ? (cameraHeight > cameraWidth ? 'portrait' : 'landscape') : null);

    // Ưu tiên orientation thật của camera (mọi device).
    // Fallback: rule cũ (mobile + viewport portrait → portrait).
    let recordingLayout: 'landscape_16_9' | 'portrait_9_16';
    if (cameraOrientation === 'portrait') {
      recordingLayout = 'portrait_9_16';
    } else if (cameraOrientation === 'landscape') {
      recordingLayout = 'landscape_16_9';
    } else if (sourceDeviceType === 'mobile' && viewportOrientation === 'portrait') {
      recordingLayout = requestedLayout;
    } else {
      recordingLayout = 'landscape_16_9';
    }
    console.log('[live-webcam-start] resolved layout', {
      sourceDeviceType,
      viewportOrientation,
      cameraWidth,
      cameraHeight,
      cameraOrientation,
      requestedLayout,
      recordingLayout,
    });
    const layout = resolveRecordingLayout(recordingLayout, quality);
    const now = new Date().toISOString();

    const { data: profile } = await admin
      .from('profiles')
      .select('is_banned')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.is_banned) throw new HttpError(403, 'BANNED', 'Tài khoản không thể phát trực tiếp.');

    const { data: activeSessions } = await admin
      .from('live_sessions')
      .select('id')
      .eq('mode', 'agora_webcam')
      .eq('host_user_id', user.id)
      .in('status', ['created', 'starting', 'live', 'recording', 'ending', 'processing', 'processing_replay'])
      .limit(5);
    if (activeSessions?.length) {
      const cleanupTask = Promise.allSettled(
        activeSessions.map((active) =>
          forceEndLive(admin, active.id, 'superseded_by_new_live', { source: 'live-webcam-start' }).catch((error) => {
            console.warn('[live-webcam-start] force-end old session failed', active.id, error?.message || error);
            throw error;
          })
        )
      );
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (typeof edgeRuntime?.waitUntil === 'function') {
        edgeRuntime.waitUntil(cleanupTask);
      } else {
        void cleanupTask;
      }
    }

    sessionId = crypto.randomUUID();
    channel = `${buildAgoraChannelName(user.id, Date.now())}_${crypto.randomUUID().slice(0, 8)}`;
    const hostUid = uuidToAgoraNumericUid(user.id);
    recordingUid = buildRecordingUid(sessionId, hostUid);
    const tempBucket = Deno.env.get('R2_TEMP_BUCKET') || Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '';
    const archiveBucket = Deno.env.get('R2_ARCHIVE_BUCKET') || Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '';
    const postId = await insertLivePost(admin, {
      user_id: user.id,
      content: title || 'Đang LIVE trên FUN Profile',
      visibility: privacy,
      post_type: 'live',
      metadata: {
        live_session_id: sessionId,
        live_status: 'live',
        live_mode: 'agora_webcam',
        live_title: title,
        live_description: description,
        recording_provider: 'agora',
        replay_status: 'recording',
        recording_layout: layout.layout,
        recording_width: layout.width,
        recording_height: layout.height,
        recording_aspect_ratio: layout.aspectRatio,
        source_device_type: sourceDeviceType,
        started_at: now,
      },
    });

    await insertLiveSessionWithSchemaFallback(admin, {
      id: sessionId,
      user_id: user.id,
      owner_id: user.id,
      host_user_id: user.id,
      title,
      description,
      privacy,
      status: 'live',
      mode: 'agora_webcam',
      storage_provider: 'r2',
      playback_provider: 'r2',
      agora_channel: channel,
      agora_channel_name: channel,
      channel_name: channel,
      agora_uid: hostUid,
      agora_uid_host: hostUid,
      recording_uid: recordingUid,
      recording_provider: 'agora',
      recording_status: 'acquiring',
      recording_layout: layout.layout,
      recording_width: layout.width,
      recording_height: layout.height,
      recording_aspect_ratio: layout.aspectRatio,
      source_device_type: sourceDeviceType,
      temp_bucket: tempBucket,
      temp_object_key: `agora-temp/${user.id}/${sessionId}`,
      archive_bucket: archiveBucket,
      post_id: postId,
      live_post_id: postId,
      started_at: now,
      last_host_heartbeat_at: now,
      last_seen_at: now,
      host_connection_status: 'online',
      created_at: now,
      updated_at: now,
    });

    await logEvent(admin, sessionId, 'start_live', { host_user_id: user.id, channel_name: channel });

    const hostToken = buildRtcToken(channel, hostUid, 'publisher');
    const tokenIssuedAtIso = new Date(hostToken.issuedAt * 1000).toISOString();
    const tokenExpiresAtIso = new Date(hostToken.expiresAt * 1000).toISOString();
    await admin.from('live_sessions').update({
      token_issued_at: tokenIssuedAtIso,
      token_expires_at: tokenExpiresAtIso,
      token_expires_in_seconds: hostToken.expiresIn,
      updated_at: new Date().toISOString(),
    }).eq('id', sessionId).then(undefined, () => undefined);
    await logEvent(admin, sessionId, 'rtc_token_issued', {
      uid: hostUid,
      role: 'publisher',
      issued_at: tokenIssuedAtIso,
      expires_at: tokenExpiresAtIso,
      expires_in_seconds: hostToken.expiresIn,
    });
    console.info('[live-webcam-start] RTC token issued', {
      liveSessionId: sessionId,
      channelName: channel,
      uid: hostUid,
      issuedAt: hostToken.issuedAt,
      expiresAt: hostToken.expiresAt,
      expiresIn: hostToken.expiresIn,
    });
    await logEvent(admin, sessionId, 'recording_start_queued', {
      recording_uid: recordingUid,
      recording_layout: layout.layout,
      storagePath: `${tempBucket}/agora-temp/${user.id}/${sessionId}`,
    });
    const recordingTask = ensureAgoraRecordingStarted(admin, sessionId, {
      source: 'live-webcam-start-background',
      maxAttempts: 2,
    }).catch((error) => {
      console.error('[live-webcam-start] background recording starter failed', {
        liveSessionId: sessionId,
        error: normalizeError(error),
      });
    });
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (typeof edgeRuntime?.waitUntil === 'function') {
      edgeRuntime.waitUntil(recordingTask);
    } else {
      void recordingTask;
    }

    return json({
      sessionId,
      channel,
      token: hostToken.token,
      uid: hostUid,
      appId: hostToken.appId,
      expiresAt: hostToken.expiresAt,
      recordingAvailable: false,
      recordingStartQueued: true,
      fallbackRecordingRecommended: false,
    });
  } catch (error) {
    const normalized = normalizeError(error);
    console.error('[live-webcam-start] failed', normalized);
    if (sessionId) {
      await admin.from('live_sessions').update({
        status: 'failed',
        recording_status: 'failed',
        error_message: normalized.message,
        recording_error: normalized.message,
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId).then(undefined, () => undefined);
    }
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: normalized.message, code: normalized.code || 'LIVE_WEBCAM_START_FAILED' }, status);
  }
});
