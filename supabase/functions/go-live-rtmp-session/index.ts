/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  getStreamLiveInput,
  getStreamPlaybackUrls,
  isLiveInputConnected,
  listStreamLiveInputVideos,
  selectActiveLiveVideo,
} from '../_shared/cloudflareStreamService.ts';
import { corsHeaders, createAdminClient, HttpError, json, normalizeError, requireUser } from '../_shared/httpAuth.ts';
import { isRtmpFrozenStatus } from '../_shared/rtmpSessionStatus.ts';
import { safeErrorText } from '../_shared/safeErrorText.ts';

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
      .select('*')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    // Session đã kết thúc trước đó (watchdog timeout hoặc end thủ công) ⇒ KHÔNG cho go-live lại.
    // Bất kể status đã bị reset như thế nào, ended_at là dấu hiệu cứng cho thấy phiên đã chết.
    if (session.ended_at) {
      return json({
        error: 'Phiên live này đã kết thúc trước đó. Vui lòng tạo phiên Live Producer mới.',
        code: 'SESSION_ENDED',
      }, 409);
    }

    // Đảm bảo session đang armed (Live Input đang hoạt động). Nếu false → producer page đã bị disarm.
    if (session.is_input_armed === false) {
      return json({ error: 'Phiên đã bị giải phóng. Vui lòng tải lại trang Live Producer rồi thử lại.', code: 'SESSION_NOT_ARMED' }, 409);
    }

    // Phải re-check Cloudflare để chắc chắn có ACTIVE LIVE VIDEO (không chỉ RTMP socket).
    let sourceConnected = false;
    let cloudflareVideoUid: string | null = null;

    if (session.cloudflare_live_input_id) {
      const liveInput = await getStreamLiveInput(session.cloudflare_live_input_id).catch(() => null);
      const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
      const liveVideo = selectActiveLiveVideo(videos, session.armed_at || session.created_at || null, 60);

      // Yêu cầu video thật trong list — không chấp nhận chỉ kết nối RTMP.
      sourceConnected = isLiveInputConnected(liveInput) && !!liveVideo;
      cloudflareVideoUid = liveVideo
        ? String((liveVideo as any).uid || '')
        : null;

      console.log('[OBS_DETECT]', {
        scope: 'go_live_recheck',
        liveSessionId,
        liveInputId: session.cloudflare_live_input_id,
        videoCount: Array.isArray(videos) ? videos.length : 0,
        selectedVideoUidExists: !!liveVideo,
        liveInputConnected: isLiveInputConnected(liveInput),
        connected: sourceConnected,
        previewUrlExists: !!cloudflareVideoUid,
      });
      console.log('[RTMP_GO_LIVE_SOURCE_CHECK]', {
        sessionId: liveSessionId,
        liveInputId: session.cloudflare_live_input_id,
        mappedSourceConnected: sourceConnected,
        cloudflareVideoUid,
        inputStatus: liveInput ? {
          status: (liveInput as any).status,
          state: (liveInput as any).state,
          connected: (liveInput as any).connected,
          readyToStream: (liveInput as any).readyToStream,
        } : null,
        liveVideoStatus: liveVideo ? {
          uid: (liveVideo as any).uid,
          status: (liveVideo as any).status,
          state: (liveVideo as any).state,
          live: (liveVideo as any).live,
          readyToStream: (liveVideo as any).readyToStream,
        } : null,
      });
    }

    if (!sourceConnected || !cloudflareVideoUid) {
      return json({ error: 'OBS đã kết nối nhưng chưa gửi dữ liệu video. Vui lòng đợi vài giây và thử lại.' }, 409);
    }
    if (!session.title?.trim()) return json({ error: 'Tiêu đề là bắt buộc' }, 400);
    if (!session.description?.trim()) return json({ error: 'Mô tả là bắt buộc' }, 400);

    // Idempotency siết: chỉ pre-live + live mới được go-live.
    // Terminal/replay statuses tuyệt đối không được "tái sinh" thành live mới.
    if (isRtmpFrozenStatus(session.status)) {
      return json({
        error: 'Phiên live này đã kết thúc. Vui lòng tạo phiên mới để phát trực tiếp.',
        code: 'SESSION_ENDED',
      }, 409);
    }

    const now = new Date().toISOString();
    const fallbackUrls = cloudflareVideoUid ? getStreamPlaybackUrls(cloudflareVideoUid) : null;
    // Ưu tiên URL mới build từ UID video hiện tại (tránh dùng URL stale từ phiên cũ).
    const playbackUrl = fallbackUrls?.hls || session.preview_url || session.hls_url || session.playback_url || null;
    if (!playbackUrl) return json({ error: 'Playback URL chưa sẵn sàng' }, 409);

    let postId = session.post_id || session.live_post_id || null;

    // Idempotency theo live_session_id:
    // - status='live' + đã có post → trả lại đúng post đó (chống double-click).
    // - status pre-live + chưa có post → tạo post MỚI.
    // - status pre-live nhưng đã có post (bất thường) → từ chối, tránh đè post replay cũ.
    if (postId && session.status !== 'live') {
      return json({
        error: 'Phiên này đã có bài LIVE liên kết nhưng không ở trạng thái live. Vui lòng tạo phiên mới.',
        code: 'SESSION_POST_MISMATCH',
        live_post_id: postId,
      }, 409);
    }

    if (!postId) {
      const { data: post, error: postError } = await admin
        .from('posts')
        .insert({
          user_id: user.id,
          content: `${session.title}\n\n${session.description}`,
          visibility: session.privacy === 'friends' ? 'friends' : 'public',
          post_type: 'live',
          video_url: playbackUrl,
          metadata: {
            live_title: session.title,
            live_description: session.description,
            live_status: 'live',
            live_mode: 'rtmp_obs',
            live_session_id: session.id,
            badge: 'LIVE',
            media_type: 'live_video',
            playback_type: 'cloudflare_live_input',
            playback_provider: 'cloudflare_stream',
            storage_provider: 'cloudflare_stream',
            playback_url: playbackUrl,
            hls_url: playbackUrl,
          cloudflare_live_input_id: session.cloudflare_live_input_id,
            viewer_count: 0,
            started_at: now,
            published_at: now,
          },
        })
        .select('id')
        .single();
      if (postError) throw postError;
      postId = post.id;
      console.log('[RTMP_GO_LIVE_POST_CREATED]', { live_session_id: session.id, post_id: postId });
    } else {
      // status='live' + cùng postId ⇒ idempotent. Chỉ refresh metadata kỹ thuật (playback URL, status),
      // KHÔNG đụng content/created_at/published_at để tránh đẩy bài lên top hay đổi vị trí feed.
      const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
      await admin.from('posts').update({
        video_url: playbackUrl,
        post_type: 'live',
        metadata: {
          ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
          live_status: 'live',
          live_mode: 'rtmp_obs',
          live_session_id: session.id,
          badge: 'LIVE',
          media_type: 'live_video',
          playback_type: 'cloudflare_live_input',
          playback_provider: 'cloudflare_stream',
          storage_provider: 'cloudflare_stream',
          playback_url: playbackUrl,
          hls_url: playbackUrl,
          started_at: (post?.metadata && typeof post.metadata === 'object' && (post.metadata as any).started_at) || session.started_at || now,
        },
      }).eq('id', postId);
      console.log('[RTMP_GO_LIVE_POST_REUSED_IDEMPOTENT]', { live_session_id: session.id, post_id: postId });
    }

    const { data: updated, error: updateError } = await admin
      .from('live_sessions')
      .update({
        status: 'live',
        connection_status: 'connected',
        source_connected: true,
        last_disconnected_at: null,
        connected_at: session.connected_at || session.source_connected_at || now,
        disconnected_at: null,
        last_connection_check_at: now,
        live_input_status: 'live',
        preview_ready: true,
        preview_url: playbackUrl,
        end_reason: null,
        started_at: session.status === 'live' && session.started_at ? session.started_at : now,
        source_connected_at: session.source_connected_at || now,
        go_live_clicked_at: now,
        ended_at: null,
        post_id: postId,
        live_post_id: postId,
        cloudflare_video_uid: cloudflareVideoUid,
        hls_url: playbackUrl,
        playback_url: playbackUrl,
        recording_status: 'recording',
        recording_error: null,
        archive_status: 'pending',
        archive_error: null,
        updated_at: now,
      })
      .eq('id', session.id)
      .select('id, status, title, description, source_connected, source_connected_at, connection_status, connected_at, disconnected_at, last_connection_check_at, live_input_status, preview_ready, preview_url, hls_url, playback_url, cloudflare_video_uid, post_id, live_post_id, started_at, go_live_clicked_at')
      .single();
    if (updateError) throw updateError;

    return json({ ok: true, live_session: updated, live_post_id: postId });
  } catch (error) {
    const info = normalizeError(error);
    const status = error instanceof HttpError ? error.status : (info.status || 500);
    const code = error instanceof HttpError ? error.code : (info.code || (status === 401 ? 'UNAUTHORIZED' : 'INTERNAL'));
    const message = safeErrorText(info.message);
    console.error('[RTMP_GO_LIVE_FAILED]', { status, code, message });
    return json({ error: message, code, status }, status);
  }
});
