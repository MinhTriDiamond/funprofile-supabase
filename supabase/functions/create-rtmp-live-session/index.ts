/* eslint-disable @typescript-eslint/no-explicit-any */
import { checkStreamLiveInputExists, createStreamLiveInput, deleteStreamLiveInput, getStreamPlaybackUrls, setStreamLiveInputEnabled } from '../_shared/cloudflareStreamService.ts';
import { decryptStreamKey, encryptStreamKey, tryDecryptStreamKey } from '../_shared/streamKeyCrypto.ts';
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';
import { armSession, supersedeOtherArmedSessions } from '../_shared/rtmpArmingService.ts';
import { isRtmpSessionEndedOrFrozen } from '../_shared/rtmpSessionStatus.ts';
import { CloudflareApiError } from '../_shared/cloudflareApiError.ts';

/**
 * Self-heal khi giải mã stream_key cũ thất bại (secret rotate). Tạo Live Input
 * mới ở Cloudflare, mã hoá lại key bằng secret hiện tại, update session +
 * persistent config (nếu có) + dọn input cũ. KHÔNG dùng khi session đang LIVE.
 */
async function rescuePersistentKey(admin: any, params: {
  userId: string;
  sessionId: string;
  oldLiveInputId: string | null;
  rtmpConfigId: string | null;
  isPersistent: boolean;
  title: string;
}): Promise<{ liveInputId: string; rtmpsUrl: string; streamKey: string; encryptedKey: string; hls: string }> {
  const liveInput = await createStreamLiveInput({
    name: params.title || (params.isPersistent ? 'Fun Profile Persistent OBS Live' : 'OBS Live'),
    userId: params.userId,
    liveSessionId: params.sessionId,
  });
  if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) {
    throw new Error('Cloudflare did not return RTMPS credentials during rescue');
  }
  const encryptedKey = await encryptStreamKey(liveInput.rtmpsStreamKey);
  const urls = getStreamPlaybackUrls(liveInput.uid);
  const nowIso = new Date().toISOString();

  if (params.isPersistent && params.rtmpConfigId) {
    await admin.from('rtmp_stream_configs').update({
      cloudflare_live_input_id: liveInput.uid,
      rtmps_url: liveInput.rtmpsUrl,
      stream_key_encrypted: encryptedKey,
      stream_key_last_reset_at: nowIso,
      updated_at: nowIso,
    }).eq('id', params.rtmpConfigId).eq('user_id', params.userId);
  }

  await admin.from('live_sessions').update({
    cloudflare_live_input_id: liveInput.uid,
    rtmps_url: liveInput.rtmpsUrl,
    stream_key_encrypted: encryptedKey,
    stream_key_last_reset_at: nowIso,
    hls_url: urls.hls,
    playback_url: urls.hls,
    status: 'waiting_for_obs',
    source_connected: false,
    source_connected_at: null,
    connection_status: 'waiting',
    live_input_status: 'waiting',
    updated_at: nowIso,
  }).eq('id', params.sessionId);

  if (params.oldLiveInputId && params.oldLiveInputId !== liveInput.uid) {
    deleteStreamLiveInput(params.oldLiveInputId).catch((err) => {
      console.warn('[RTMP_KEY_RESCUE] old live input cleanup failed', String(err));
    });
  }

  console.log('[RTMP_KEY_RESCUE]', {
    sessionId: params.sessionId,
    isPersistent: params.isPersistent,
    rtmpConfigId: params.rtmpConfigId,
    oldLiveInputId: params.oldLiveInputId,
    newLiveInputId: liveInput.uid,
  });

  return {
    liveInputId: liveInput.uid,
    rtmpsUrl: liveInput.rtmpsUrl,
    streamKey: liveInput.rtmpsStreamKey,
    encryptedKey,
    hls: urls.hls,
  };
}


function cleanTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  return title.slice(0, 5000);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function safeDiagnosticMessage(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/((?:stream[_ -]?key|authorization|(?:cloudflare[_ -]?)?(?:api[_ -]?)?token|secret[_ -]?key|encryption[_ -]?key)\s*[:=]\s*)[^\s,;"']+/gi, '$1[redacted]')
    .slice(0, 500);
}

async function serializeSession(session: any, streamKey: string | null, extras: Record<string, unknown> = {}) {
  return {
    ok: true,
    live_session: session,
    live_session_id: session.id,
    post_id: session.post_id || session.live_post_id || null,
    live_post_id: session.live_post_id || null,
    rtmps_url: session.rtmps_url,
    stream_key: streamKey,
    hls_url: session.hls_url,
    playback_url: session.playback_url || session.hls_url || null,
    cloudflare_video_uid: session.cloudflare_video_uid || null,
    status: session.status,
    title: session.title || '',
    description: session.description || '',
    source_connected: !!session.source_connected,
    source_connected_at: session.source_connected_at || null,
    connection_status: session.connection_status || 'waiting',
    connected_at: session.connected_at || null,
    disconnected_at: session.disconnected_at || null,
    last_connection_check_at: session.last_connection_check_at || null,
    live_input_status: session.live_input_status || null,
    preview_ready: !!session.preview_ready,
    preview_url: session.preview_url || null,
    reconnect_count: Number(session.reconnect_count || 0),
    rtmp_config_id: session.rtmp_config_id || null,
    is_persistent_stream: !!session.is_persistent_stream,
    is_input_armed: session.is_input_armed === undefined ? true : !!session.is_input_armed,
    armed_session_token: session.armed_session_token || null,
    producer_url: `/live/obs/${session.id}`,
    ...extras,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const title = cleanTitle(body.title);
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 5000) : '';
    const privacy = body.privacy === 'friends' ? 'friends' : 'public';
    const requestedSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
    const admin = createAdminClient() as any;

    // Resolve persistent preference: explicit body value wins; otherwise read from profile.
    const hasExplicitPersistent = body.is_persistent_stream !== undefined || body.is_persistent !== undefined;
    let wantsPersistent: boolean;
    if (hasExplicitPersistent) {
      wantsPersistent = toBoolean(body.is_persistent_stream ?? body.is_persistent, false);
    } else {
      const { data: profile } = await admin
        .from('profiles')
        .select('preferred_rtmp_stream_mode')
        .eq('id', user.id)
        .maybeSingle();
      wantsPersistent = profile?.preferred_rtmp_stream_mode === 'persistent';
    }

    // Persist preference when client explicitly requested it (toggle action).
    if (hasExplicitPersistent && body.update_preference === true) {
      await admin
        .from('profiles')
        .update({ preferred_rtmp_stream_mode: wantsPersistent ? 'persistent' : 'temporary' })
        .eq('id', user.id);
    }

    // Reset cứng các trường preview/source khi resume — chống stale từ phiên trước.
    // QUAN TRỌNG (refactor 13/05/2026): CHỈ reset khi không có dấu hiệu phiên còn sống.
    // Có cloudflare_video_uid hoặc source_connected=true ⇒ phiên đang chảy, KHÔNG được clear.
    const RESET_PREVIEW_FIELDS = {
      source_connected: false,
      preview_ready: false,
      preview_url: null,
      cloudflare_video_uid: null,
      hls_url: null,
      playback_url: null,
      connection_status: 'waiting',
      live_input_status: 'waiting',
      disconnected_at: null,
      last_disconnected_at: null,
      source_connected_at: null,
      connected_at: null,
    } as const;
    // CHỈ những status thực sự "rỗng" mới được reset. 'source_connected'/'ready_to_go_live'
    // ⇒ đã có nguồn video, KHÔNG reset (gây mất preview khi reload).
    const RESETTABLE_STATUSES = ['waiting_for_obs', 'failed'];

    /**
     * Có cho phép reset preview fields cho session này không?
     * False nếu: đang live/grace, đã có UID/preview, hoặc client yêu cầu resume_only.
     */
    function canResetPreview(s: any, resumeOnly: boolean): boolean {
      if (resumeOnly) return false;
      if (!RESETTABLE_STATUSES.includes(s.status)) return false;
      if (s.cloudflare_video_uid) return false;
      if (s.source_connected) return false;
      if (s.preview_ready) return false;
      return true;
    }

    const resumeOnly = body.resume_only === true;

    // Statuses
    const PRE_LIVE_STATUSES = ['waiting_for_obs', 'source_connected', 'ready_to_go_live'];
    const LOCKED_LIVE_STATUSES = ['live', 'disconnect_grace'];
    if (requestedSessionId) {
      const { data: requested, error: requestedError } = await admin
        .from('live_sessions')
        .select('id, status, rtmps_url, stream_key_encrypted, hls_url, playback_url, post_id, live_post_id, title, description, source_connected, source_connected_at, connection_status, connected_at, disconnected_at, last_connection_check_at, live_input_status, preview_ready, preview_url, reconnect_count, cloudflare_video_uid, rtmp_config_id, is_persistent_stream, owner_id, host_user_id, cloudflare_live_input_id, armed_session_token, is_input_armed, armed_at, ended_at, end_reason')
        .eq('id', requestedSessionId)
        .maybeSingle();
      if (requestedError) throw requestedError;
      if (!requested) return json({ error: 'Live session not found' }, 404);
      if (requested.owner_id !== user.id && requested.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);

      // Phiên đã kết thúc/đang archive ⇒ KHÔNG resume. FE phải tạo phiên mới.
      // Check ended_at trước status để bắt cả trường hợp status đã bị một flow khác reset.
      if (isRtmpSessionEndedOrFrozen(requested)) {
        return json({
          error: 'Phiên live này đã kết thúc. Vui lòng tạo phiên mới.',
          code: 'SESSION_ENDED',
          live_session_id: requested.id,
          status: requested.status,
        }, 409);
      }

      const isLockedLive = LOCKED_LIVE_STATUSES.includes(requested.status);

      // Arm idempotent + supersede chỉ những phiên armed pre-live của user khác (khác id hiện tại).
      await supersedeOtherArmedSessions(admin, user.id, requested.id);
      const armed = await armSession(admin, requested);
      let resetApplied: string[] = [];
      if (canResetPreview(requested, resumeOnly)) {
        const { data: resetRow } = await admin
          .from('live_sessions')
          .update({ ...RESET_PREVIEW_FIELDS, updated_at: new Date().toISOString() })
          .eq('id', requested.id)
          .not('status', 'in', '("live","ended","processing","posted","disconnect_grace","source_connected","ready_to_go_live")')
          .select('id, status, source_connected, preview_ready, preview_url, cloudflare_video_uid, hls_url, playback_url, connection_status, live_input_status')
          .maybeSingle();
        if (resetRow) {
          Object.assign(requested, resetRow);
          resetApplied = Object.keys(RESET_PREVIEW_FIELDS);
        }
      }
      console.log('[RTMP_RESET]', {
        sessionId: requested.id,
        branch: 'requestedSessionId',
        status: requested.status,
        resumeOnly,
        isLockedLive,
        hadUid: !!requested.cloudflare_video_uid,
        hadSourceConnected: !!requested.source_connected,
        fieldsCleared: resetApplied,
      });
      const armedSession = { ...requested, is_input_armed: true, armed_session_token: armed.armed_session_token };

      let requestedStreamKey = await tryDecryptStreamKey(requested.stream_key_encrypted);
      let requestedKeyRescued = false;
      const requestedInputMissing = !isLockedLive && requested.cloudflare_live_input_id
        ? (await checkStreamLiveInputExists(requested.cloudflare_live_input_id)).exists === false
        : false;
      if (!isLockedLive && (requestedInputMissing || (requested.stream_key_encrypted && requestedStreamKey === null))) {

        const rescued = await rescuePersistentKey(admin, {
          userId: user.id,
          sessionId: requested.id,
          oldLiveInputId: requested.cloudflare_live_input_id || null,
          rtmpConfigId: requested.rtmp_config_id || null,
          isPersistent: !!requested.is_persistent_stream,
          title: requested.title || '',
        });
        armedSession.cloudflare_live_input_id = rescued.liveInputId;
        armedSession.rtmps_url = rescued.rtmpsUrl;
        armedSession.stream_key_encrypted = rescued.encryptedKey;
        armedSession.hls_url = rescued.hls;
        armedSession.playback_url = rescued.hls;
        armedSession.status = 'waiting_for_obs';
        requestedStreamKey = rescued.streamKey;
        requestedKeyRescued = true;
      }

      return json(await serializeSession(
        armedSession,
        requestedStreamKey,
        {
          resumed: true,
          armed: true,
          armed_session_token: armed.armed_session_token,
          resume_only: resumeOnly,
          is_locked_live: isLockedLive,
          persistent_key_rescued: requestedKeyRescued,
          key_reset_required: !isLockedLive ? false : (requested.stream_key_encrypted && requestedStreamKey === null),
        },
      ));
    }

    // Ưu tiên 1: nếu user còn phiên đang LIVE / GRACE → KHÔNG tạo phiên mới đè lên.
    // Trả về phiên đó với is_locked_live=true để FE redirect và khoá UI.
    const { data: lockedLive } = await admin
      .from('live_sessions')
      .select('id, status, rtmps_url, stream_key_encrypted, hls_url, playback_url, post_id, live_post_id, title, description, source_connected, source_connected_at, connection_status, connected_at, disconnected_at, last_connection_check_at, live_input_status, preview_ready, preview_url, reconnect_count, cloudflare_video_uid, rtmp_config_id, is_persistent_stream, cloudflare_live_input_id, armed_session_token, is_input_armed, armed_at')
      .eq('owner_id', user.id)
      .eq('mode', 'rtmp_obs')
      .is('deleted_at', null)
      .in('status', LOCKED_LIVE_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lockedLive && body.force_new !== true) {
      await supersedeOtherArmedSessions(admin, user.id, lockedLive.id);
      const armed = await armSession(admin, lockedLive);
      console.log('[RTMP_LOCKED_LIVE_REDIRECT]', { sessionId: lockedLive.id, status: lockedLive.status });
      const armedSession = { ...lockedLive, is_input_armed: true, armed_session_token: armed.armed_session_token };
      const lockedStreamKey = await tryDecryptStreamKey(lockedLive.stream_key_encrypted);
      return json(await serializeSession(
        armedSession,
        lockedStreamKey,
        {
          resumed: true, armed: true, armed_session_token: armed.armed_session_token,
          resume_only: true, is_locked_live: true,
          key_reset_required: !!lockedLive.stream_key_encrypted && lockedStreamKey === null,
        },
      ));
    }

    // Ưu tiên 2: phiên pre-live (chưa go-live, chưa có post). Resume bình thường.
    const { data: existing } = await admin
      .from('live_sessions')
      .select('id, status, rtmps_url, stream_key_encrypted, hls_url, playback_url, post_id, live_post_id, title, description, source_connected, source_connected_at, connection_status, connected_at, disconnected_at, last_connection_check_at, live_input_status, preview_ready, preview_url, reconnect_count, cloudflare_video_uid, rtmp_config_id, is_persistent_stream, cloudflare_live_input_id, armed_session_token, is_input_armed, armed_at')
      .eq('owner_id', user.id)
      .eq('mode', 'rtmp_obs')
      .is('deleted_at', null)
      .in('status', PRE_LIVE_STATUSES)
      .is('live_post_id', null)
      .is('post_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && body.force_new !== true) {
      await supersedeOtherArmedSessions(admin, user.id, existing.id);
      const armed = await armSession(admin, existing);
      let resetApplied: string[] = [];
      if (canResetPreview(existing, resumeOnly)) {
        const { data: resetRow } = await admin
          .from('live_sessions')
          .update({ ...RESET_PREVIEW_FIELDS, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .not('status', 'in', '("live","ended","processing","posted","disconnect_grace","source_connected","ready_to_go_live")')
          .select('id, status, source_connected, preview_ready, preview_url, cloudflare_video_uid, hls_url, playback_url, connection_status, live_input_status')
          .maybeSingle();
        if (resetRow) {
          Object.assign(existing, resetRow);
          resetApplied = Object.keys(RESET_PREVIEW_FIELDS);
        }
      }
      console.log('[RTMP_RESET]', {
        sessionId: existing.id,
        branch: 'existing_pre_live',
        status: existing.status,
        resumeOnly,
        hadUid: !!existing.cloudflare_video_uid,
        hadSourceConnected: !!existing.source_connected,
        fieldsCleared: resetApplied,
      });
      const armedSession = { ...existing, is_input_armed: true, armed_session_token: armed.armed_session_token };
      let existingStreamKey = await tryDecryptStreamKey(existing.stream_key_encrypted);
      let existingKeyRescued = false;
      const existingInputMissing = existing.cloudflare_live_input_id
        ? (await checkStreamLiveInputExists(existing.cloudflare_live_input_id)).exists === false
        : false;
      if (existingInputMissing || (existing.stream_key_encrypted && existingStreamKey === null)) {

        const rescued = await rescuePersistentKey(admin, {
          userId: user.id,
          sessionId: existing.id,
          oldLiveInputId: existing.cloudflare_live_input_id || null,
          rtmpConfigId: existing.rtmp_config_id || null,
          isPersistent: !!existing.is_persistent_stream,
          title: existing.title || '',
        });
        armedSession.cloudflare_live_input_id = rescued.liveInputId;
        armedSession.rtmps_url = rescued.rtmpsUrl;
        armedSession.stream_key_encrypted = rescued.encryptedKey;
        armedSession.hls_url = rescued.hls;
        armedSession.playback_url = rescued.hls;
        armedSession.status = 'waiting_for_obs';
        existingStreamKey = rescued.streamKey;
        existingKeyRescued = true;
      }
      return json(await serializeSession(
        armedSession,
        existingStreamKey,
        {
          resumed: true, armed: true, armed_session_token: armed.armed_session_token,
          resume_only: resumeOnly, is_locked_live: false,
          persistent_key_rescued: existingKeyRescued,
        },
      ));
    }

    const sessionId = crypto.randomUUID();
    const channelName = `rtmp_${user.id.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;
    let rtmpConfigId: string | null = null;
    let liveInputId: string | null = null;
    let rtmpsUrl: string | null = null;
    let streamKey: string | null = null;
    let encryptedKey: string | null = null;

    if (wantsPersistent) {
      const { data: existingConfig, error: configReadError } = await admin
        .from('rtmp_stream_configs')
        .select('id, cloudflare_live_input_id, rtmps_url, stream_key_encrypted, stream_key_last_reset_at')
        .eq('user_id', user.id)
        .eq('is_persistent', true)
        .is('deleted_at', null)
        .maybeSingle();
      if (configReadError) throw configReadError;

      if (existingConfig) {
        rtmpConfigId = existingConfig.id;
        liveInputId = existingConfig.cloudflare_live_input_id;
        rtmpsUrl = existingConfig.rtmps_url;
        encryptedKey = existingConfig.stream_key_encrypted;
        streamKey = await tryDecryptStreamKey(encryptedKey);
        // Self-heal 2 trường hợp:
        //  (1) ciphertext cũ (secret rotate) không giải mã được;
        //  (2) Live Input đã bị xoá khỏi Cloudflare (404) → Stream Key chết, OBS không kết nối được.
        let persistentInputMissing = false;
        if (liveInputId) {
          const probe = await checkStreamLiveInputExists(liveInputId);
          persistentInputMissing = probe.exists === false;
        }
        if (!liveInputId || persistentInputMissing || (encryptedKey && streamKey === null)) {
          const liveInput = await createStreamLiveInput({
            name: 'Fun Profile Persistent OBS Live',
            userId: user.id,
            liveSessionId: sessionId,
          });
          if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) {
            throw new Error('Cloudflare did not return RTMPS credentials');
          }
          const newEncryptedKey = await encryptStreamKey(liveInput.rtmpsStreamKey);
          await admin.from('rtmp_stream_configs').update({
            cloudflare_live_input_id: liveInput.uid,
            rtmps_url: liveInput.rtmpsUrl,
            stream_key_encrypted: newEncryptedKey,
            stream_key_last_reset_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', existingConfig.id).eq('user_id', user.id);
          if (existingConfig.cloudflare_live_input_id && existingConfig.cloudflare_live_input_id !== liveInput.uid && !persistentInputMissing) {
            deleteStreamLiveInput(existingConfig.cloudflare_live_input_id).catch((err) => {
              console.warn('[RTMP_KEY_RESCUE] persistent config old input cleanup failed', String(err));
            });
          }
          console.log('[RTMP_KEY_RESCUE]', {
            scope: persistentInputMissing ? 'missing_live_input' : 'persistent_config',
            rtmpConfigId: existingConfig.id,
            oldLiveInputId: existingConfig.cloudflare_live_input_id,
            newLiveInputId: liveInput.uid,
          });
          liveInputId = liveInput.uid;
          rtmpsUrl = liveInput.rtmpsUrl;
          encryptedKey = newEncryptedKey;
          streamKey = liveInput.rtmpsStreamKey;
        }

        // Live Input sẽ được armSession() bật lại sau khi tạo session — không enable ở đây.
      } else {
        const liveInput = await createStreamLiveInput({ name: 'Fun Profile Persistent OBS Live', userId: user.id, liveSessionId: sessionId });
        if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) throw new Error('Cloudflare did not return RTMPS credentials');
        encryptedKey = await encryptStreamKey(liveInput.rtmpsStreamKey);
        const { data: createdConfig, error: configCreateError } = await admin
          .from('rtmp_stream_configs')
          .insert({
            user_id: user.id,
            is_persistent: true,
            cloudflare_live_input_id: liveInput.uid,
            rtmps_url: liveInput.rtmpsUrl,
            stream_key_encrypted: encryptedKey,
            stream_key_last_reset_at: new Date().toISOString(),
          })
          .select('id, cloudflare_live_input_id, rtmps_url, stream_key_encrypted')
          .single();
        if (configCreateError) throw configCreateError;
        rtmpConfigId = createdConfig.id;
        liveInputId = createdConfig.cloudflare_live_input_id;
        rtmpsUrl = createdConfig.rtmps_url;
        streamKey = liveInput.rtmpsStreamKey;
      }
    } else {
      const liveInput = await createStreamLiveInput({ name: title || 'OBS Live', userId: user.id, liveSessionId: sessionId });
      if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) throw new Error('Cloudflare did not return RTMPS credentials');
      liveInputId = liveInput.uid;
      rtmpsUrl = liveInput.rtmpsUrl;
      streamKey = liveInput.rtmpsStreamKey;
      encryptedKey = await encryptStreamKey(liveInput.rtmpsStreamKey);
    }

    if (!liveInputId || !rtmpsUrl || !streamKey || !encryptedKey) throw new Error('Cloudflare did not return RTMPS credentials');
    const urls = getStreamPlaybackUrls(liveInputId);

    const { data: liveSession, error: liveError } = await (admin as any)
      .from('live_sessions')
      .insert({
        id: sessionId,
        user_id: user.id,
        host_user_id: user.id,
        owner_id: user.id,
        mode: 'rtmp_obs',
        title,
        description,
        privacy,
        status: 'waiting_for_obs',
        recording_status: 'processing',
        processing_started_at: new Date().toISOString(),
        channel_name: channelName,
        rtmp_config_id: rtmpConfigId,
        is_persistent_stream: wantsPersistent,
        cloudflare_live_input_id: liveInputId,
        rtmps_url: rtmpsUrl,
        stream_key_encrypted: encryptedKey,
        stream_key_last_reset_at: new Date().toISOString(),
        playback_url: urls.hls,
        hls_url: urls.hls,
        storage_provider: 'cloudflare_stream',
        playback_provider: 'cloudflare_stream',
        connection_status: 'waiting',
        source_connected: false,
        connected_at: null,
        disconnected_at: null,
        last_connection_check_at: null,
        live_input_status: 'waiting',
        preview_ready: false,
        preview_url: null,
        reconnect_count: 0,
        archive_status: 'pending',
      })
      .select('id, status, cloudflare_live_input_id, rtmps_url, hls_url, playback_url, post_id, live_post_id, title, description, source_connected, source_connected_at, connection_status, connected_at, disconnected_at, last_connection_check_at, live_input_status, preview_ready, preview_url, reconnect_count, cloudflare_video_uid, rtmp_config_id, is_persistent_stream')
      .single();
    if (liveError) throw liveError;

    // Session vừa tạo → arm + supersede các session armed cũ của user.
    await supersedeOtherArmedSessions(admin, user.id, liveSession.id);
    const armed = await armSession(admin, liveSession);

    return json(await serializeSession(
      { ...liveSession, is_input_armed: true, armed_session_token: armed.armed_session_token },
      streamKey,
      { resumed: false, armed: true, armed_session_token: armed.armed_session_token },
    ));
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      console.error('[create-rtmp-live-session] Cloudflare upstream failure', {
        operation: error.message,
        upstreamStatus: error.upstreamStatus,
        upstreamCodes: error.upstreamCodes,
      });
      return json({
        error: 'Cloudflare Stream từ chối yêu cầu tạo Live Input.',
        code: 'CLOUDFLARE_UPSTREAM_ERROR',
        upstream_status: error.upstreamStatus,
        upstream_code: error.upstreamCodes[0] ?? null,
      }, 502);
    }

    let message: string;
    if (error instanceof Error) message = error.message;
    else if (error && typeof error === 'object') {
      const anyErr = error as any;
      message = anyErr.message || anyErr.error_description || anyErr.hint || 'Internal error';
    } else message = String(error);
    const safeMessage = safeDiagnosticMessage(message || 'Internal error');
    console.error('[create-rtmp-live-session] failed', {
      errorType: error instanceof Error ? error.name : typeof error,
      message: safeMessage,
    });
    return json({ error: safeMessage }, message === 'Unauthorized' ? 401 : 500);
  }
});
