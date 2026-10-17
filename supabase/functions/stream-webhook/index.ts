/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { detectRtmpLiveConnection, getStreamLiveInput, getStreamPlaybackUrls, getStreamVideo, isLiveInputConnected, isStreamVideoActivelyLive, listStreamLiveInputVideos, selectActiveLiveVideo, selectRtmpReplayVideoForSession, setStreamLiveInputEnabled } from '../_shared/cloudflareStreamService.ts';
import { markStreamReadyAndArchive } from '../_shared/livestreamProcessingService.ts';
import { isInputArmingEnabled } from '../_shared/rtmpArmingService.ts';
import { getObsReconnectTimeoutSeconds } from '../_shared/rtmpEndLiveService.ts';
import { safeErrorText } from '../_shared/safeErrorText.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseSignature(header: string | null): { time: string; sig1: string } | null {
  if (!header) return null;
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, value] = part.trim().split('=');
    return [key, value];
  }));
  if (!parts.time || !parts.sig1) return null;
  return { time: parts.time, sig1: parts.sig1 };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWebhook(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get('CLOUDFLARE_STREAM_WEBHOOK_SECRET') || Deno.env.get('CLOUDFLARE_WEBHOOK_SECRET');
  const sigHeader = req.headers.get('Webhook-Signature');
  console.log('[WEBHOOK] signature received', { hasSecret: !!secret, hasHeader: !!sigHeader });
  if (!secret || !sigHeader) return false;

  const parsed = parseSignature(sigHeader);
  if (!parsed) {
    console.warn('[WEBHOOK] signature parse failed');
    return false;
  }

  const timestamp = Number(parsed.time);
  if (!Number.isFinite(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 5 * 60) {
    console.warn('[WEBHOOK] timestamp skew', { skewSeconds: now - timestamp });
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parsed.time}.${rawBody}`));
  const ok = constantTimeEqual(toHex(signature), parsed.sig1);
  if (!ok) console.warn('[WEBHOOK] HMAC mismatch');
  return ok;
}

function extractUid(event: any): string | null {
  return event?.uid || event?.data?.uid || event?.video?.uid || event?.result?.uid || null;
}

function extractEventType(event: any): string {
  // Cloudflare Stream uses several keys depending on event family:
  //   - `notificationName`: "video.live_input.connected" / "video.live_input.disconnected" / "stream-live-input.connected"
  //   - `eventType` / `event_type`
  //   - `type` / `event` / `name`
  const raw = event?.notificationName
    || event?.notification_name
    || event?.eventType
    || event?.event_type
    || event?.type
    || event?.event
    || event?.name
    || event?.data?.type
    || '';
  return String(raw).toLowerCase();
}

function extractLiveInputId(event: any): string | null {
  return event?.liveInput
    || event?.live_input
    || event?.liveInputUid
    || event?.input_id
    || event?.inputId
    || event?.data?.liveInput
    || event?.data?.live_input
    || event?.data?.liveInputUid
    || event?.data?.input_id
    || event?.data?.inputId
    || event?.data?.input?.uid
    || event?.data?.input?.id
    || event?.data?.live_input?.uid
    || event?.input?.uid
    || event?.input?.id
    || null;
}

function normalizeState(event: any, video: any): string {
  const status = event?.status || event?.data?.status || event?.video?.status || video?.status || {};
  const state = status?.state || status?.current || event?.state || event?.data?.state || video?.status?.state;
  if (event?.readyToStream === true || video?.readyToStream === true) return 'ready';
  return typeof state === 'string' ? state.toLowerCase() : 'processing';
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

async function findOrCreateReplayForVideo(admin: any, uid: string, event: any, video: any): Promise<any | null> {
  const { data: replay } = await admin
    .from('live_replays')
    .select('id, live_session_id, stream_uid, cloudflare_vod_enabled')
    .eq('stream_uid', uid)
    .maybeSingle();
  if (replay) return replay;

  const liveSessionId = event?.meta?.liveSessionId
    || event?.data?.meta?.liveSessionId
    || video?.meta?.liveSessionId
    || video?.meta?.live_session_id
    || event?.liveSessionId
    || event?.data?.liveSessionId
    || null;
  const liveInputId = event?.liveInput
    || event?.data?.liveInput
    || event?.data?.live_input
    || video?.input?.uid
    || video?.liveInput
    || null;

  let sessions: any[] = [];
  if (liveSessionId) {
    const { data } = await admin.from('live_sessions').select('*').eq('id', liveSessionId).limit(1);
    sessions = Array.isArray(data) ? data : (data ? [data] : []);
  } else if (liveInputId) {
    const { data } = await admin
      .from('live_sessions')
      .select('*')
      .eq('cloudflare_live_input_id', liveInputId)
      .or('post_id.not.is.null,live_post_id.not.is.null')
      .order('updated_at', { ascending: false })
      .limit(10);
    sessions = Array.isArray(data) ? data : (data ? [data] : []);
  } else {
    const { data } = await admin.from('live_sessions').select('*').eq('cloudflare_video_uid', uid).limit(1);
    sessions = Array.isArray(data) ? data : (data ? [data] : []);
  }

  let session: any | null = null;
  let strictReason = 'no_candidate_sessions';
  const validationVideo = {
    ...(event || {}),
    ...(video || {}),
    data: { ...((event || {}).data || {}), ...((video || {}).data || {}) },
    meta: { ...((event || {}).meta || {}), ...((event || {}).data?.meta || {}), ...((video || {}).meta || {}) },
    liveInput: video?.liveInput || event?.liveInput || event?.data?.liveInput || event?.data?.live_input || video?.input?.uid,
  };
  for (const candidate of sessions) {
    const selection = selectRtmpReplayVideoForSession([validationVideo] as any, candidate, uid, {
      skewSeconds: 60,
      afterEndMinutes: 10,
    });
    if (selection.video && selection.uid) {
      session = candidate;
      strictReason = selection.reason;
      break;
    }
    strictReason = selection.reason;
  }
  if (!session) {
    console.warn('[WEBHOOK_REPLAY_IGNORED]', {
      reason: 'no_strict_session_match',
      uid,
      liveSessionId: liveSessionId || null,
      liveInputId: liveInputId || null,
      strictReason,
      candidates: sessions.length,
    });
    return null;
  }

  const hasPublishedLivePost = !!(session.post_id || session.live_post_id);
  if (!hasPublishedLivePost) {
    console.warn('[WEBHOOK_REPLAY_IGNORED]', {
      reason: 'pre_live_test_video',
      uid,
      liveSessionId: session.id,
      liveInputId,
      status: session.status,
    });
    return null;
  }

  console.log('[WEBHOOK_REPLAY_STRICT_MATCH]', { uid, liveSessionId: session.id, reason: strictReason });

  await admin.from('live_sessions').update({
    cloudflare_video_uid: uid,
    status: 'ended',
    ended_at: session.ended_at || new Date().toISOString(),
    recording_status: 'ready',
    recording_ready_at: new Date().toISOString(),
  }).eq('id', session.id);

  const urls = getStreamPlaybackUrls(uid);
  const { data: created, error } = await admin.from('live_replays').upsert({
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
    status: 'processing',
    processing_started_at: new Date().toISOString(),
    storage_provider: 'cloudflare_stream',
    playback_provider: 'cloudflare_stream',
    archive_status: 'pending',
    cloudflare_vod_enabled: true,
    last_cf_response: video || event,
  }, { onConflict: 'chunked_recording_id' }).select('id, live_session_id, stream_uid, cloudflare_vod_enabled').single();
  if (error) throw error;
  return created;
}

async function handleLiveInputEvent(admin: any, event: any, type: string): Promise<Response | null> {
  const liveInputId = extractLiveInputId(event);
  const typeMentionsLiveInput = type.includes('live_input') || type.includes('live-input') || type.includes('liveinput');
  let isDisconnected = type.includes('disconnect');
  let isConnected = !isDisconnected && (type.includes('connect') || type.includes('reconnect') || type.includes('live'));
  const eventUid = extractUid(event);
  const eventLooksLikeLiveVideo = !!eventUid && isStreamVideoActivelyLive(event);

  // Fallback: nếu type không rõ nhưng có liveInputId, hỏi Cloudflare API trực tiếp.
  if (!isConnected && !isDisconnected && liveInputId) {
    const liveInput = await getStreamLiveInput(liveInputId).catch(() => null);
    const apiConnected = isLiveInputConnected(liveInput);
    isConnected = apiConnected || eventLooksLikeLiveVideo;
    isDisconnected = !isConnected && !eventLooksLikeLiveVideo;
    console.log('[WEBHOOK] type fallback via Cloudflare API', { liveInputId, apiConnected, eventUid, eventLooksLikeLiveVideo });
  }

  if (!isConnected && !isDisconnected) return null;
  // Chỉ xử lý khi event thực sự liên quan live_input (tránh trùng video.* event)
  if (!typeMentionsLiveInput && !liveInputId) return null;

  if (!liveInputId) return json({ ok: true, ignored: 'missing live input id' });

  const armingEnabled = isInputArmingEnabled();

  // Chỉ chấp nhận event khi có session ARMED (user đang mở Live Producer).
  // Loại bỏ hoàn toàn nhánh tự tạo draft session từ rtmp_stream_configs cũ —
  // đó là gốc rễ bug "LIVE ma" (Cloudflare nhận stream khi user chưa mở producer).
  let sessionQuery = admin
    .from('live_sessions')
    .select('*')
    .eq('cloudflare_live_input_id', liveInputId)
    .in('status', ['waiting_for_obs', 'source_connected', 'ready_to_go_live', 'live', 'disconnect_grace', 'reconnecting'])
    .order('updated_at', { ascending: false })
    .limit(1);
  if (armingEnabled) sessionQuery = sessionQuery.eq('is_input_armed', true);
  const { data: session } = await sessionQuery.maybeSingle();

  if (!session) {
    if (armingEnabled && isConnected) {
      // Defensive: kick OBS bằng cách disable Live Input, tránh lãng phí bandwidth Cloudflare.
      try {
        await setStreamLiveInputEnabled(liveInputId, false);
      } catch (error) {
        console.warn('[WEBHOOK_DEFENSIVE_DISABLE_FAILED]', {
          liveInputId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    console.warn('[WEBHOOK_IGNORED]', {
      reason: 'unarmed',
      liveInputId,
      eventType: type,
      isConnected,
      isDisconnected,
    });
    return json({ ok: true, ignored: 'input_not_armed' });
  }

  // Guard timestamp: bỏ event cũ hơn armed_at - 60s (replay/late delivery của phiên trước).
  const eventCreatedRaw = event?.created_on || event?.created || event?.data?.created_on || event?.data?.created || null;
  const eventCreatedMs = eventCreatedRaw ? Date.parse(String(eventCreatedRaw)) : NaN;
  const armedAtMs = session.armed_at ? Date.parse(String(session.armed_at)) : 0;
  if (Number.isFinite(eventCreatedMs) && armedAtMs > 0 && eventCreatedMs < armedAtMs - 60_000) {
    console.warn('[WEBHOOK_IGNORED]', {
      reason: 'stale_event',
      liveSessionId: session.id,
      eventCreatedRaw,
      armedAt: session.armed_at,
    });
    return json({ ok: true, ignored: 'stale_event' });
  }

  const now = new Date().toISOString();
  const detailsComplete = !!session.title?.trim() && !!session.description?.trim();
  if (isDisconnected) {
    const recheck = await detectRtmpLiveConnection(session, { skewSeconds: 60 });
    if (recheck.connected || recheck.videoStreaming) {
      const recheckUrls = recheck.activeVideoUid ? getStreamPlaybackUrls(recheck.activeVideoUid) : null;
      const nextStatus = session.status === 'live' || ((session.status === 'disconnect_grace' || session.status === 'reconnecting' || session.status === 'ready_to_go_live' || session.status === 'source_connected') && (session.post_id || session.live_post_id))
        ? 'live'
        : (detailsComplete ? 'ready_to_go_live' : 'source_connected');
      await admin.from('live_sessions').update({
        status: nextStatus,
        source_connected: true,
        connection_status: 'connected',
        connected_at: session.connected_at || session.source_connected_at || now,
        disconnected_at: null,
        last_disconnected_at: null,
        last_connection_check_at: now,
        last_source_seen_at: now,
        live_input_status: recheck.videoStreaming ? 'live' : 'input_connected_no_video',
        preview_ready: recheck.videoStreaming ? !!recheckUrls?.hls : !!session.preview_ready,
        preview_url: recheckUrls?.hls || session.preview_url || session.hls_url || null,
        hls_url: recheckUrls?.hls || session.hls_url || null,
        playback_url: recheckUrls?.hls || session.playback_url || null,
        cloudflare_video_uid: recheck.activeVideoUid || session.cloudflare_video_uid || null,
        reconnect_count: Number(session.reconnect_count || 0) + 1,
        recording_status: 'recording',
        archive_error: null,
        source_disconnected_at: null,
        auto_end_at: null,
      }).eq('id', session.id);

      console.log('[WEBHOOK] ignored stale disconnect; Cloudflare still connected', {
        live_session_id: session.id,
        reason: recheck.reason,
        diagnostics: recheck.diagnostics,
      });
      return json({
        ok: true,
        ignored: 'stale_disconnect_cloudflare_connected',
        status: nextStatus,
        live_session_id: session.id,
        source_connected: true,
        diagnostics: recheck.diagnostics,
      });
    }
    if (!recheck.confirmedDisconnected || recheck.errors?.length || recheck.reason === 'cloudflare_soft_fail' || recheck.reason === 'unknown_input_state') {
      console.warn('[WEBHOOK] defer disconnect event: Cloudflare state not confirmed', {
        live_session_id: session.id,
        reason: recheck.reason,
      });
      return json({ ok: true, ignored: 'cloudflare_disconnect_not_confirmed', live_session_id: session.id });
    }
  }
  const liveInputVideos = isConnected
    ? await listStreamLiveInputVideos(liveInputId).catch((error) => {
      console.warn('[WEBHOOK] failed to list live input videos for OBS preview', {
        liveInputId,
        liveSessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return [] as any[];
    })
    : [];
  if (eventLooksLikeLiveVideo && eventUid && !liveInputVideos.some((item: any) => String(item?.uid || '') === String(eventUid))) {
    liveInputVideos.unshift(event);
  }
  // Lọc nghiêm ngặt: chỉ chấp nhận video ĐANG live realtime + thuộc PHIÊN HIỆN TẠI (created >= armed_at - 60s).
  // Loại VOD/replay phiên cũ — chống "ghost preview" khi reuse persistent live input.
  const sessionStartedAt = session.armed_at || session.created_at || null;
  const liveVideo = selectActiveLiveVideo(liveInputVideos, sessionStartedAt, 60);
  const videoUid = liveVideo?.uid ? String(liveVideo.uid) : null; // KHÔNG fallback session.cloudflare_video_uid (có thể stale)
  const streamUrls = videoUid ? getStreamPlaybackUrls(videoUid) : null;
  const previewUrl = streamUrls?.hls || null;
  const canPreservePreview = session.status === 'live' || session.status === 'disconnect_grace' || session.status === 'reconnecting';
  const persistedPreviewUrl = previewUrl || (canPreservePreview ? (session.preview_url || session.hls_url || session.playback_url || null) : null);
  const previewReady = isConnected && (!!previewUrl || !!session.preview_ready);

  console.log('[OBS_DETECT]', {
    scope: 'webhook',
    liveSessionId: session.id,
    liveInputId,
    videoCount: liveInputVideos.length,
    selectedVideoUidExists: !!videoUid,
    liveInputConnected: isConnected,
    connected: isConnected,
    previewUrlExists: !!previewUrl,
  });

  // ===== CONNECTED =====
  if (isConnected) {
    const wasDisconnected = !!(session.source_disconnected_at || session.last_disconnected_at || session.disconnected_at || session.auto_end_at);
    const wasInGrace = (session.status === 'live' || session.status === 'disconnect_grace' || session.status === 'reconnecting') && wasDisconnected;
    const nextStatus = session.status === 'live' || ((session.status === 'disconnect_grace' || session.status === 'reconnecting' || session.status === 'ready_to_go_live' || session.status === 'source_connected') && (session.post_id || session.live_post_id))
      ? 'live' // Public live reconnects during grace, keep it public.
      : (detailsComplete ? 'ready_to_go_live' : 'source_connected');
    await admin.from('live_sessions').update({
      status: nextStatus,
      source_connected: true,
      connection_status: 'connected',
      source_connected_at: session.source_connected_at || now,
      connected_at: session.connected_at || session.source_connected_at || now,
      disconnected_at: null,
      last_disconnected_at: null,
      last_connection_check_at: now,
      last_source_seen_at: now,
      live_input_status: 'live',
      preview_ready: previewReady,
      preview_url: persistedPreviewUrl,
      hls_url: persistedPreviewUrl,
      playback_url: persistedPreviewUrl,
      cloudflare_video_uid: videoUid || session.cloudflare_video_uid || null,
      reconnect_count: wasDisconnected ? Number(session.reconnect_count || 0) + 1 : Number(session.reconnect_count || 0),
      recording_status: 'recording',
      archive_error: null,
      source_disconnected_at: null,
      auto_end_at: null,
      signal_status: 'connected',
      signal_lost_at: null,
      reconnect_deadline_at: null,
      auto_end_reason: null,
    }).eq('id', session.id);

    if (session.post_id || session.live_post_id) {
      const postId = session.post_id || session.live_post_id;
      const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
      await admin.from('posts').update({
        metadata: {
          ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
          live_status: nextStatus,
          live_mode: 'rtmp_obs',
          live_session_id: session.id,
          playback_type: 'cloudflare_live_input',
        },
      }).eq('id', postId);
    }

    if (wasInGrace) {
      const userId = session.owner_id || session.host_user_id || session.user_id;
      if (userId) {
        await admin.from('notifications').insert({
          user_id: userId,
          type: 'live_reconnected',
          title: 'Đã kết nối lại nguồn live',
          body: 'OBS đã kết nối lại — buổi live tiếp tục bình thường.',
          metadata: { live_session_id: session.id, post_id: session.post_id || session.live_post_id || null },
        }).select().single().catch(() => null);
      }
    }
    logObsSignal({
      sessionId: session.id,
      userId: session.owner_id || session.host_user_id || session.user_id || null,
      status: wasDisconnected ? 'reconnected' : 'connected',
      signalLostAt: null,
      reconnectDeadlineAt: null,
      reason: wasDisconnected ? 'obs_signal_restored' : 'obs_signal_connected',
    });
    console.log('[WEBHOOK] OBS source connected', {
      live_session_id: session.id,
      status: nextStatus,
      previewReady,
      previewUrlExists: !!previewUrl,
      cloudflareVideoUidExists: !!videoUid,
      reconnected: !!wasInGrace,
    });

    return json({
      ok: true,
      status: nextStatus,
      live_session_id: session.id,
      source_connected: true,
      preview_ready: previewReady,
      previewUrlExists: !!previewUrl,
      reconnected: !!wasInGrace,
    });
  }

  // ===== DISCONNECTED =====
  // Nếu phiên đang LIVE (đã public) → vào reconnecting (env OBS_RECONNECT_TIMEOUT_SECONDS, default 60s), KHÔNG end ngay
  const isPublicLive = session.status === 'live' && (!!session.post_id || !!session.live_post_id);
  if (isPublicLive) {
    const reconnectTimeoutSeconds = getObsReconnectTimeoutSeconds();
    const disconnectedAt = session.source_disconnected_at || now;
    const reconnectDeadlineAt = getReconnectDeadline(disconnectedAt, reconnectTimeoutSeconds);
    await admin.from('live_sessions').update({
      // Public live enters reconnecting; replay/archive is triggered only after timeout or manual end.
      status: 'reconnecting',
      source_connected: false,
      connection_status: 'reconnecting',
      source_disconnected_at: disconnectedAt,
      last_disconnected_at: disconnectedAt,
      disconnected_at: disconnectedAt,
      last_source_seen_at: disconnectedAt,
      last_connection_check_at: now,
      live_input_status: 'signal_lost',
      preview_ready: false,
      auto_end_at: reconnectDeadlineAt,
      recording_status: 'source_disconnected',
      signal_status: 'lost',
      signal_lost_at: disconnectedAt,
      reconnect_deadline_at: reconnectDeadlineAt,
    }).eq('id', session.id);

    const postId = session.post_id || session.live_post_id;
    if (postId) {
      const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
      await admin.from('posts').update({
        metadata: {
          ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
          live_status: 'reconnecting',
          live_mode: 'rtmp_obs',
          live_session_id: session.id,
          playback_type: 'cloudflare_live_input',
          source_disconnected_at: disconnectedAt,
          auto_end_at: reconnectDeadlineAt,
        },
      }).eq('id', postId);
    }

    logObsSignal({
      sessionId: session.id,
      userId: session.owner_id || session.host_user_id || session.user_id || null,
      status: 'lost',
      signalLostAt: disconnectedAt,
      reconnectDeadlineAt,
      reason: 'obs_signal_lost_detected',
    });
    console.log('[WEBHOOK] OBS source disconnected, entering reconnecting', {
      live_session_id: session.id,
      reconnect_deadline_at: reconnectDeadlineAt,
    });

    return json({ ok: true, status: 'reconnecting', live_session_id: session.id, auto_end_at: reconnectDeadlineAt, reconnect_deadline_at: reconnectDeadlineAt });
  }

  // Before public go-live, stay in reconnecting so the producer can reconnect OBS.
  if (session.status === 'reconnecting' || session.connection_status === 'reconnecting') {
    const reconnectTimeoutSeconds = getObsReconnectTimeoutSeconds();
    const disconnectedAt = session.source_disconnected_at || now;
    const reconnectDeadlineAt = session.reconnect_deadline_at || getReconnectDeadline(disconnectedAt, reconnectTimeoutSeconds);
    await admin.from('live_sessions').update({
      status: 'reconnecting',
      source_connected: false,
      connection_status: 'reconnecting',
      source_disconnected_at: disconnectedAt,
      last_disconnected_at: disconnectedAt,
      disconnected_at: disconnectedAt,
      last_connection_check_at: now,
      live_input_status: 'signal_lost',
      preview_ready: false,
      auto_end_at: reconnectDeadlineAt,
      signal_status: 'lost',
      signal_lost_at: disconnectedAt,
      reconnect_deadline_at: reconnectDeadlineAt,
    }).eq('id', session.id);

    logObsSignal({
      sessionId: session.id,
      userId: session.owner_id || session.host_user_id || session.user_id || null,
      status: 'lost',
      signalLostAt: disconnectedAt,
      reconnectDeadlineAt,
      reason: 'obs_signal_lost_detected',
    });
    console.log('[WEBHOOK] OBS source disconnected before publish', {
      live_session_id: session.id,
      reconnect_deadline_at: reconnectDeadlineAt,
    });
    return json({ ok: true, status: 'reconnecting', live_session_id: session.id, source_connected: false, reconnect_deadline_at: reconnectDeadlineAt });
  }

  // Before public go-live, return to waiting so the producer can reconnect OBS.
  await admin.from('live_sessions').update({
    status: 'waiting_for_obs',
    source_connected: false,
    connection_status: 'disconnected',
    source_disconnected_at: now,
    last_disconnected_at: now,
    disconnected_at: now,
    last_connection_check_at: now,
    live_input_status: 'disconnected',
    preview_ready: false,
    preview_url: null,
    recording_status: 'waiting',
  }).eq('id', session.id);

  console.log('[WEBHOOK] OBS source disconnected before publish', {
    live_session_id: session.id,
  });

  return json({ ok: true, status: 'waiting_for_obs', live_session_id: session.id, source_connected: false });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rawBody = await req.text();
  if (!(await verifyWebhook(req, rawBody))) return json({ error: 'Invalid signature' }, 401);

  try {
    const event = JSON.parse(rawBody);
    const uid = extractUid(event);
    const type = extractEventType(event);
    console.log('[WEBHOOK] event received', {
      type: type || 'unknown',
      uidPresent: !!uid,
      liveInputIdPresent: !!extractLiveInputId(event),
      typeKeys: {
        hasNotificationName: typeof event?.notificationName === 'string' || typeof event?.notification_name === 'string',
        hasEventType: typeof event?.eventType === 'string' || typeof event?.type === 'string',
      },
    });
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const liveInputResponse = await handleLiveInputEvent(admin as any, event, type);
    if (liveInputResponse) return liveInputResponse;

    if (!uid) return json({ ok: true, ignored: 'missing uid' });

    const video = await getStreamVideo(uid);
    const replay = await findOrCreateReplayForVideo(admin as any, uid, event, video);
    if (!replay) return json({ ok: true, ignored: 'replay not found' });
    if (replay.cloudflare_vod_enabled === false) {
      await (admin as any).from('live_replays').update({
        webhook_received_at: new Date().toISOString(),
        last_webhook_event: 'ignored_legacy_disabled',
        last_cf_status: 'ignored_legacy_disabled',
        last_cf_response: event,
      }).eq('id', replay.id);
      return json({ ok: true, ignored: 'cloudflare vod disabled for legacy replay' });
    }

    const state = normalizeState(event, video);
    console.log('[WEBHOOK] parsed state', { uid, state, readyToStream: video?.readyToStream ?? event?.readyToStream });

    if (state === 'ready') {
      await markStreamReadyAndArchive(admin, { replay, uid, event, video }).catch((error) => {
        console.error('[WEBHOOK] archive after ready failed; retry cron will handle it', safeErrorText(error));
      });
      return json({ ok: true, status: 'ready' });
    }

    if (state === 'error' || state === 'failed') {
      const reason = (video as any)?.status?.errReasonText || event?.status?.errReasonText || event?.errReasonText || 'Cloudflare Stream processing failed';
      await (admin as any).from('live_replays').update({
        status: 'failed',
        error_message: reason,
        last_error_at: new Date().toISOString(),
        webhook_received_at: new Date().toISOString(),
        last_webhook_event: state,
        last_cf_status: state,
        last_cf_response: video || event,
      }).eq('id', replay.id);
      await admin.from('live_sessions').update({ recording_status: 'failed', recording_error: reason }).eq('id', replay.live_session_id);
      return json({ ok: true, status: 'failed' });
    }

    await (admin as any).from('live_replays').update({
      status: 'processing',
      webhook_received_at: new Date().toISOString(),
      last_webhook_event: state,
      last_cf_status: state,
      last_cf_response: video || event,
    }).eq('id', replay.id);

    return json({ ok: true, status: 'processing' });
  } catch (error) {
    const message = safeErrorText(error);
    console.error('stream-webhook error:', message);
    return json({ error: message }, 500);
  }
});
