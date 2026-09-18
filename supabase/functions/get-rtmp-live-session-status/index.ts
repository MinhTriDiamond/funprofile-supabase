/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  detectRtmpLiveConnection,
  getLiveInputState,
  getStreamPlaybackUrls,
} from '../_shared/cloudflareStreamService.ts';
import { corsHeaders, createAdminClient, HttpError, json, normalizeError, requireUser } from '../_shared/httpAuth.ts';
import { endRtmpLiveSession, getDisconnectGraceSeconds, getObsReconnectTimeoutSeconds } from '../_shared/rtmpEndLiveService.ts';
import { isRtmpSessionEndedOrFrozen, rtmpFrozenStatusSqlList } from '../_shared/rtmpSessionStatus.ts';

function toIsoAfterSeconds(baseIso: string, seconds: number): string | null {
  const base = Date.parse(baseIso);
  if (!Number.isFinite(base)) return null;
  return new Date(base + Math.max(0, seconds) * 1000).toISOString();
}

function getReconnectDeadline(session: any, signalLostAt: string | null, timeoutSeconds: number): string | null {
  if (session.reconnect_deadline_at) return session.reconnect_deadline_at;
  if (!signalLostAt) return null;
  return toIsoAfterSeconds(signalLostAt, timeoutSeconds);
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

function nextProducerStatus(session: any, connected: boolean): string {
  if (isRtmpSessionEndedOrFrozen(session)) {
    return session.status;
  }
  // 'failed' should not lock the session if OBS is still connected — allow user to retry go-live.
  if (connected && session.status === 'disconnect_grace' && (session.post_id || session.live_post_id)) return 'live';
  if (connected && session.status === 'reconnecting' && (session.post_id || session.live_post_id)) return 'live';
  if (connected && session.status === 'live') return 'live';
  if (session.status === 'failed' && !connected) return 'failed';
  if (!connected && ['live', 'disconnect_grace', 'source_connected', 'ready_to_go_live', 'reconnecting'].includes(session.status)) return 'reconnecting';
  if (!connected) return 'waiting_for_obs';
  return session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
    if (!liveSessionId) return json({ error: 'Missing live_session_id' }, 400);

    const admin = createAdminClient() as any;
    const { data: session, error } = await admin
      .from('live_sessions')
      .select('id, owner_id, host_user_id, mode, status, title, description, source_connected_at, source_connected, connected_at, disconnected_at, connection_status, last_disconnected_at, last_connection_check_at, live_input_status, preview_ready, preview_url, reconnect_count, ended_at, end_reason, auto_end_reason, signal_status, signal_lost_at, reconnect_deadline_at, cloudflare_live_input_id, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error, rtmp_config_id, is_persistent_stream, is_input_armed, armed_at, armed_session_token, created_at, updated_at')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    const now = new Date().toISOString();
    if (isRtmpSessionEndedOrFrozen(session)) {
      const titleValid = !!session.title?.trim();
      const descriptionValid = !!session.description?.trim();
      return json({
        ok: true,
        frozen: true,
        sessionId: session.id,
        status: session.status,
        sourceConnected: false,
        playbackUrl: session.playback_url || session.hls_url || null,
        hlsUrl: session.hls_url || session.playback_url || null,
        previewReady: false,
        previewUrl: null,
        cloudflareVideoUid: session.cloudflare_video_uid || null,
        updatedAt: session.updated_at || now,
        connectionStatus: session.connection_status || 'ended',
        lastDisconnectedAt: session.last_disconnected_at || null,
        signalStatus: session.signal_status || null,
        signalLostAt: session.signal_lost_at || null,
        reconnectDeadlineAt: session.reconnect_deadline_at || null,
        disconnectGraceSeconds: getDisconnectGraceSeconds(),
        cloudflareLiveInputState: null,
        inputConnected: false,
        videoStreaming: false,
        cloudflareDiagnostics: {
          liveInputIdExists: !!session.cloudflare_live_input_id,
          liveInputState: null,
          liveInputConnected: false,
          videoStreaming: false,
          videoCount: 0,
          selectedVideoUidExists: false,
          previewUrlExists: !!(session.hls_url || session.playback_url),
          reason: session.ended_at ? 'session_ended_at_frozen' : 'session_status_frozen',
          errors: [],
        },
        live_session: session,
        source_connected: false,
        input_connected: false,
        video_streaming: false,
        preview_ready: false,
        details_complete: titleValid && descriptionValid,
        can_go_live: false,
        cloudflare_video_uid: session.cloudflare_video_uid || null,
        cloudflare_live_input: null,
        cloudflare_live_video: null,
      });
    }

    const detection = await detectRtmpLiveConnection(session, { skewSeconds: 60 });
    const inputConnected = detection.inputConnected;
    const videoStreaming = detection.videoStreaming;
    const liveInput = detection.liveInput;
    const liveVideo = detection.activeVideo;
    const cloudflareVideoUid = detection.activeVideoUid;
    const videoListCount = detection.diagnostics.videoCount;
    const pickedReason = detection.reason;
    const cloudflareErrors = detection.errors;
    const sessionStartedAt = session.armed_at || session.created_at || null;
    // Live Input connected is the source-of-truth for RTMP still pushing.
    // Video list/active video is used for preview UID only and may lag Cloudflare.
    const connected = detection.connected;

    const connectedStatuses = ['source_connected', 'ready_to_go_live', 'live', 'disconnect_grace', 'reconnecting'];
    const reconnectTimeoutSeconds = getObsReconnectTimeoutSeconds();
    const liveInputMissing = detection.liveInputMissing === true;
    const cloudflareReadFailed = !liveInputMissing && cloudflareErrors.some((item) =>
      item.startsWith('getStreamLiveInput:') || item.startsWith('listStreamLiveInputVideos:')
    );

    // Live Input đã bị xoá khỏi Cloudflare → Stream Key hiện tại vô hiệu.
    // Không coi là "chưa kết nối" nữa; báo rõ để user đặt lại Stream Key.
    if (liveInputMissing && !connected) {
      await admin
        .from('live_sessions')
        .update({ last_connection_check_at: now })
        .eq('id', liveSessionId);
      console.warn('[RTMP_STATUS_LIVE_INPUT_MISSING]', {
        liveSessionId,
        status: session.status,
        liveInputId: session.cloudflare_live_input_id || null,
      });
      return json({
        ok: true,
        sessionId: session.id,
        status: session.status,
        sourceConnected: false,
        source_connected: false,
        inputConnected: false,
        input_connected: false,
        videoStreaming: false,
        video_streaming: false,
        previewReady: !!session.preview_ready,
        preview_ready: !!session.preview_ready,
        playbackUrl: session.playback_url || session.hls_url || null,
        hlsUrl: session.hls_url || session.playback_url || null,
        cloudflareVideoUid: session.cloudflare_video_uid || null,
        cloudflare_video_uid: session.cloudflare_video_uid || null,
        updatedAt: session.updated_at || now,
        connectionStatus: 'stream_key_invalid',
        signalStatus: session.signal_status || null,
        liveInputMissing: true,
        live_input_missing: true,
        streamKeyInvalid: true,
        stream_key_invalid: true,
        keyResetRequired: true,
        key_reset_required: true,
        configError: 'live_input_missing',
        configErrorMessage: 'Stream Key đã hết hiệu lực (nguồn phát trên Cloudflare không còn tồn tại). Vui lòng bấm "Đặt lại Stream Key" rồi dán lại vào OBS.',
        cloudflareDiagnostics: {
          ...detection.diagnostics,
          liveInputMissing: true,
        },
        live_session: { ...session, last_connection_check_at: now },
        details_complete: !!session.title?.trim() && !!session.description?.trim(),
        can_go_live: false,
      });
    }

    if (!connected && cloudflareReadFailed && connectedStatuses.includes(session.status)) {

      await admin
        .from('live_sessions')
        .update({ last_connection_check_at: now })
        .eq('id', liveSessionId);

      const titleValid = !!session.title?.trim();
      const descriptionValid = !!session.description?.trim();
      console.warn('[RTMP_STATUS_POLL_SOFT_FAIL]', {
        liveSessionId,
        status: session.status,
        cloudflareErrors,
      });

      return json({
        ok: true,
        sessionId: session.id,
        status: session.status,
        sourceConnected: !!session.source_connected,
        playbackUrl: session.playback_url || session.hls_url || null,
        hlsUrl: session.hls_url || session.playback_url || null,
        previewReady: !!session.preview_ready,
        previewUrl: session.preview_url || session.hls_url || session.playback_url || null,
        cloudflareVideoUid: session.cloudflare_video_uid || null,
        updatedAt: session.updated_at || now,
        connectionStatus: session.connection_status || 'connected',
        lastDisconnectedAt: session.last_disconnected_at || null,
        signalStatus: session.signal_status || null,
        signalLostAt: session.signal_lost_at || null,
        reconnectDeadlineAt: session.reconnect_deadline_at || null,
        disconnectGraceSeconds: getDisconnectGraceSeconds(),
        cloudflareLiveInputState: getLiveInputState(liveInput),
        inputConnected,
        videoStreaming,
        cloudflareDiagnostics: {
          liveInputIdExists: !!session.cloudflare_live_input_id,
          liveInputState: getLiveInputState(liveInput),
          liveInputConnected: inputConnected,
          videoStreaming,
          videoCount: videoListCount,
          selectedVideoUidExists: !!liveVideo,
          previewUrlExists: !!(session.hls_url || session.playback_url),
          reason: detection.reason,
          errors: cloudflareErrors,
        },
        live_session: { ...session, last_connection_check_at: now },
        source_connected: !!session.source_connected,
        input_connected: inputConnected,
        video_streaming: videoStreaming,
        preview_ready: !!session.preview_ready,
        details_complete: titleValid && descriptionValid,
        can_go_live: false,
        cloudflare_video_uid: session.cloudflare_video_uid || null,
        cloudflare_live_input: liveInput,
        cloudflare_live_video: liveVideo,
        soft_failed_cloudflare_check: true,
      });
    }
    let disconnectedAt = session.last_disconnected_at || null;
    const signalLostAt = session.signal_lost_at || disconnectedAt || now;
    const reconnectDeadlineAt = getReconnectDeadline(session, signalLostAt, reconnectTimeoutSeconds);
    const reconnectExpired = !connected && !!reconnectDeadlineAt && Date.now() >= Date.parse(reconnectDeadlineAt);
    if (!connected && connectedStatuses.includes(session.status) && !disconnectedAt) disconnectedAt = now;
    if (!connected && connectedStatuses.includes(session.status)) {
      const nextStatus = reconnectExpired ? 'ended' : 'reconnecting';
      const nextSignalStatus = reconnectExpired ? 'timeout_auto_end' : 'lost';
      const nextLiveInputStatus = reconnectExpired ? 'ended' : 'waiting_reconnect';
      const updateRow = {
        status: nextStatus,
        connection_status: nextStatus === 'reconnecting' ? 'reconnecting' : (nextStatus === 'waiting_for_obs' ? 'waiting' : 'disconnected'),
        source_connected: false,
        last_disconnected_at: disconnectedAt,
        disconnected_at: disconnectedAt,
        live_input_status: nextLiveInputStatus,
        signal_status: nextSignalStatus,
        signal_lost_at: signalLostAt,
        reconnect_deadline_at: reconnectExpired ? null : reconnectDeadlineAt,
        auto_end_reason: reconnectExpired ? 'obs_signal_lost_timeout' : session.auto_end_reason || null,
        updated_at: now,
      };
      await admin
        .from('live_sessions')
        .update(updateRow)
        .eq('id', liveSessionId)
        .not('status', 'in', rtmpFrozenStatusSqlList());
      logObsSignal({
        sessionId: session.id,
        userId: session.owner_id || session.host_user_id || session.user_id || null,
        status: reconnectExpired ? 'timeout_auto_end' : 'lost',
        signalLostAt,
        reconnectDeadlineAt: reconnectExpired ? null : reconnectDeadlineAt,
        reason: reconnectExpired ? 'obs_signal_lost_timeout' : (pickedReason || 'obs_signal_lost_detected'),
      });

      if (reconnectExpired) {
        const result = await endRtmpLiveSession(admin, { ...session, cloudflare_video_uid: cloudflareVideoUid || session.cloudflare_video_uid, last_disconnected_at: disconnectedAt, signal_lost_at: signalLostAt, reconnect_deadline_at: reconnectDeadlineAt }, 'obs_signal_lost_timeout');
        return json({
          ok: true,
          sessionId: session.id,
          status: 'ended',
          sourceConnected: false,
          playbackUrl: null,
          hlsUrl: null,
          cloudflareVideoUid: result.cloudflare_video_uid,
          updatedAt: now,
          disconnectGraceSeconds: getDisconnectGraceSeconds(),
          reconnectDeadlineAt: null,
          live_session: {
            ...session,
            status: 'ended',
            connection_status: 'ended',
            ended_at: now,
            end_reason: 'obs_signal_lost_timeout',
            auto_end_reason: 'obs_signal_lost_timeout',
            signal_status: 'timeout_auto_end',
            signal_lost_at: signalLostAt,
            reconnect_deadline_at: null,
            preview_ready: false,
            cloudflare_video_uid: result.cloudflare_video_uid,
          },
          source_connected: false,
          preview_ready: false,
          details_complete: !!session.title?.trim() && !!session.description?.trim(),
          can_go_live: false,
          auto_ended: true,
        });
      }
    }

    if (connected && session.status === 'reconnecting') {
      logObsSignal({
        sessionId: session.id,
        userId: session.owner_id || session.host_user_id || session.user_id || null,
        status: 'reconnected',
        signalLostAt: session.signal_lost_at || null,
        reconnectDeadlineAt: null,
        reason: pickedReason || 'obs_signal_restored',
      });
    }

    const status = nextProducerStatus(session, connected);
    let current = session;
    // CHỈ giữ playback UID/URL khi VIDEO ACTIVE thuộc PHIÊN HIỆN TẠI vừa được phát hiện.
    // KHÔNG fallback về session.cloudflare_video_uid (có thể là VOD cũ stale).
    const preserveUidStates = ['live', 'disconnect_grace', 'source_connected', 'ready_to_go_live', 'reconnecting'];
    const preserveUid = preserveUidStates.includes(session.status);
    // Producer preview cần manifest HLS ngay khi Cloudflare có video playable (ready/live),
    // KHÔNG đợi state chuyển sang live-inprogress mới sáng nút "Phát trực tiếp".
    // Vẫn gate bằng `connected = inputConnected` ở dưới ⇒ OBS tắt thì previewReady = false.
    const playbackUid = cloudflareVideoUid || detection.playableVideoUid || null;
    const fallbackUrls = playbackUid ? getStreamPlaybackUrls(playbackUid) : null;
    const hlsUrl = playbackUid ? (fallbackUrls?.hls || null) : null;
    const playbackUrlOut = hlsUrl;
    const previewReady = connected && !!hlsUrl;
    const liveInputStatus = connected
      ? 'live'
      : (session.status === 'reconnecting'
        ? 'waiting_reconnect'
        : (inputConnected ? 'input_only_no_video' : (disconnectedAt ? 'disconnected' : 'waiting')));
    // Khi mất kết nối: giữ UID + URL cho các status còn coi là "đang sống" để FE không
    // mất preview ngay lập tức trong cửa sổ reconnect ngắn. Chỉ wipe ở waiting/failed.
    const nextVideoUid = connected
      ? (cloudflareVideoUid || (preserveUid ? (session.cloudflare_video_uid || null) : null))
      : (preserveUid ? (session.cloudflare_video_uid || null) : null);
    const nextHlsUrlPersisted = preserveUid && !hlsUrl && session.hls_url ? session.hls_url : hlsUrl;
    const nextPlaybackUrlPersisted = preserveUid && !playbackUrlOut && session.playback_url ? session.playback_url : playbackUrlOut;
    const urlFixed = (nextHlsUrlPersisted || null) !== (session.hls_url || null);
    const needsFullUpdate = (
      status !== session.status
      || (connected && !session.source_connected_at)
      || nextVideoUid !== (session.cloudflare_video_uid || null)
      || urlFixed
      || previewReady !== !!session.preview_ready
      || liveInputStatus !== session.live_input_status
      || reconnectDeadlineAt !== (session.reconnect_deadline_at || null)
      || (!connected && disconnectedAt && disconnectedAt !== session.disconnected_at)
      || connected !== !!session.source_connected
    );

    if (needsFullUpdate) {
      const { data: updated } = await admin
        .from('live_sessions')
        .update({
          status,
        connection_status: connected ? 'connected' : (status === 'reconnecting' ? 'reconnecting' : (status === 'waiting_for_obs' ? 'waiting' : 'disconnected')),
          source_connected: connected,
          last_disconnected_at: connected ? null : disconnectedAt,
          connected_at: connected ? (session.connected_at || session.source_connected_at || now) : session.connected_at,
          disconnected_at: connected ? null : disconnectedAt,
          last_connection_check_at: now,
          live_input_status: liveInputStatus,
          preview_ready: connected ? previewReady : (preserveUid ? !!session.preview_ready : false),
          preview_url: nextHlsUrlPersisted,
          reconnect_count: connected && session.last_disconnected_at ? Number(session.reconnect_count || 0) + 1 : Number(session.reconnect_count || 0),
          source_connected_at: connected ? (session.source_connected_at || now) : session.source_connected_at,
          cloudflare_video_uid: nextVideoUid,
          hls_url: nextHlsUrlPersisted,
          playback_url: nextPlaybackUrlPersisted,
          signal_status: connected ? 'connected' : 'lost',
          signal_lost_at: connected ? null : signalLostAt,
          reconnect_deadline_at: connected ? null : reconnectDeadlineAt,
          auto_end_reason: connected ? null : session.auto_end_reason || null,
          updated_at: now,
        })
        .eq('id', liveSessionId)
        .not('status', 'in', rtmpFrozenStatusSqlList())
        .select('id, status, title, description, source_connected_at, source_connected, connected_at, disconnected_at, connection_status, last_disconnected_at, last_connection_check_at, live_input_status, preview_ready, preview_url, reconnect_count, ended_at, end_reason, auto_end_reason, signal_status, signal_lost_at, reconnect_deadline_at, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error, rtmp_config_id, is_persistent_stream, updated_at')
        .maybeSingle();
      if (updated) {
        current = { ...session, ...updated };
      } else {
        // Update bị skip vì session đã ở trạng thái terminal — refetch trạng thái mới.
        const { data: fresh } = await admin
          .from('live_sessions')
          .select('id, status, title, description, source_connected_at, source_connected, connected_at, disconnected_at, connection_status, last_disconnected_at, last_connection_check_at, live_input_status, preview_ready, preview_url, reconnect_count, ended_at, end_reason, auto_end_reason, signal_status, signal_lost_at, reconnect_deadline_at, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error, rtmp_config_id, is_persistent_stream, updated_at')
          .eq('id', liveSessionId)
          .maybeSingle();
        if (fresh) current = { ...session, ...fresh };
        console.log('[RTMP_STATUS_TERMINAL_SKIP]', { liveSessionId, attemptedStatus: status, currentStatus: fresh?.status });
      }
    } else {
      // Heartbeat-only: chỉ update khi session chưa terminal.
      await admin
        .from('live_sessions')
        .update({ last_connection_check_at: now })
        .eq('id', liveSessionId)
        .not('status', 'in', rtmpFrozenStatusSqlList());
      current = { ...session, last_connection_check_at: now };
    }

    const titleValid = !!current.title?.trim();
    const descriptionValid = !!current.description?.trim();
    const canGoLive = connected && previewReady && titleValid && descriptionValid;
    console.log('[OBS_DETECT_V2]', {
      scope: 'poll',
      liveSessionId,
      liveInputId: session.cloudflare_live_input_id,
      sessionStartedAt,
      armedAt: session.armed_at,
      videoCount: videoListCount,
      pickedUid: cloudflareVideoUid,
      pickedReason,
      liveInputConnected: inputConnected,
      videoStreaming,
      connected,
      previewUrlExists: !!hlsUrl,
      cloudflareErrors,
    });
    console.log('[RTMP_STATUS]', {
      sessionId: liveSessionId,
      liveInputId: session.cloudflare_live_input_id,
      cloudflareVideoUid,
      videoListCount,
      mappedSourceConnected: connected,
      titleValid,
      descriptionValid,
      canGoLive,
      urlFixed,
      hasPlaybackUid: !!playbackUid,
      newStatus: status,
      previousStatus: session.status,
      cloudflareErrors,
      inputStatus: liveInput ? {
        status: (liveInput as any).status,
        state: (liveInput as any).state,
        connected: (liveInput as any).connected,
        readyToStream: (liveInput as any).readyToStream,
        rtmps: (liveInput as any).rtmps,
      } : null,
      liveVideoStatus: liveVideo ? {
        uid: (liveVideo as any).uid,
        status: (liveVideo as any).status,
        state: (liveVideo as any).state,
        live: (liveVideo as any).live,
        readyToStream: (liveVideo as any).readyToStream,
        created: (liveVideo as any).created,
        modified: (liveVideo as any).modified,
      } : null,
    });

    // Khi disconnected nhưng status còn ở preserveUidStates ⇒ FE vẫn nhận URL/UID đã lưu
    // để giữ preview live trong cửa sổ reconnect (tránh chớp đen khi mạng OBS giật).
    const responseHls = nextHlsUrlPersisted;
    const responsePlayback = nextPlaybackUrlPersisted;
    const responseUid = cloudflareVideoUid || (preserveUid ? (current.cloudflare_video_uid || null) : null);
    const responsePreviewReady = connected ? previewReady : (preserveUid ? !!current.preview_ready : false);

    return json({
      ok: true,
      sessionId: current.id,
      status: current.status,
      sourceConnected: connected,
      playbackUrl: responsePlayback,
      hlsUrl: responseHls,
      previewReady: responsePreviewReady,
      previewUrl: responseHls,
      cloudflareVideoUid: responseUid,
      updatedAt: current.updated_at || now,
      connectionStatus: current.connection_status || (connected ? 'connected' : 'disconnected'),
      lastDisconnectedAt: current.last_disconnected_at || null,
      signalStatus: current.signal_status || null,
      signalLostAt: current.signal_lost_at || null,
      reconnectDeadlineAt: current.reconnect_deadline_at || null,
      disconnectGraceSeconds: getDisconnectGraceSeconds(),
      cloudflareLiveInputState: getLiveInputState(liveInput),
      inputConnected,
      videoStreaming,
      cloudflareDiagnostics: {
        liveInputIdExists: !!session.cloudflare_live_input_id,
        liveInputState: getLiveInputState(liveInput),
        liveInputConnected: inputConnected,
        videoStreaming,
        videoCount: videoListCount,
        selectedVideoUidExists: !!liveVideo,
        previewUrlExists: !!hlsUrl,
        reason: detection.reason,
        errors: cloudflareErrors,
      },
      live_session: current,
      source_connected: connected,
      input_connected: inputConnected,
      video_streaming: videoStreaming,
      preview_ready: previewReady,
      details_complete: titleValid && descriptionValid,
      can_go_live: canGoLive,
      cloudflare_video_uid: responseUid,
      cloudflare_live_input: liveInput,
      cloudflare_live_video: liveVideo,
      reconnecting: !connected && status === 'reconnecting',
    });
  } catch (error) {
    const info = normalizeError(error);
    const status = error instanceof HttpError ? error.status : (info.status || 500);
    const code = error instanceof HttpError ? error.code : (info.code || (status === 401 ? 'UNAUTHORIZED' : 'INTERNAL'));
    console.error('[RTMP_STATUS_POLL_FAILED]', { status, code, message: info.message, stack: info.stack, details: info.details });
    return json({ error: info.message, code, status, details: info.details }, status);
  }
});
