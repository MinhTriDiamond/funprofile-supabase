/* eslint-disable @typescript-eslint/no-explicit-any */
import { getStreamPlaybackUrls, listStreamLiveInputVideos } from './cloudflareStreamService.ts';

export const RTMP_GRACE_MINUTES = 5;

/**
 * Tạo live_replay từ Cloudflare Stream Live Input nếu video VOD đã tồn tại.
 * Idempotent qua chunked_recording_id (= session.id cho RTMP).
 */
export async function createReplayIfVideoExists(admin: any, session: any): Promise<string | null> {
  if (!session.cloudflare_live_input_id) return null;
  const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
  const video = (videos as any[]).find((item: any) => item?.uid);
  if (!video?.uid) return null;
  const uid = String(video.uid);
  const urls = getStreamPlaybackUrls(uid);
  await admin.from('live_sessions').update({ cloudflare_video_uid: uid }).eq('id', session.id);
  await admin.from('live_replays').upsert({
    live_session_id: session.id,
    user_id: session.owner_id || session.host_user_id,
    chunked_recording_id: session.id,
    stream_uid: uid,
    cloudflare_video_uid: uid,
    playback_hls: urls.hls,
    playback_dash: urls.dash,
    playback_mp4: urls.mp4,
    cloudflare_playback_url: urls.hls,
    status: video?.readyToStream ? 'ready' : 'processing',
    processing_started_at: new Date().toISOString(),
    storage_provider: 'cloudflare_stream',
    playback_provider: 'cloudflare_stream',
    archive_status: 'pending',
    cloudflare_vod_enabled: true,
  }, { onConflict: 'chunked_recording_id' });
  return uid;
}

export interface EndRtmpSessionOptions {
  reason?: string; // 'manual' | 'source_disconnected_grace_expired' | string
  notifyUser?: boolean;
}

export interface EndRtmpSessionResult {
  ok: true;
  status: 'ended' | 'already_ended';
  cloudflare_video_uid: string | null;
}

/**
 * Kết thúc 1 phiên RTMP (idempotent). Dùng chung cho:
 *  - end-rtmp-live-session (user chủ động end)
 *  - live-rtmp-grace-watchdog (auto end khi mất nguồn > GRACE_MINUTES)
 */
export async function endRtmpSession(
  admin: any,
  session: any,
  opts: EndRtmpSessionOptions = {},
): Promise<EndRtmpSessionResult> {
  if (!session) throw new Error('endRtmpSession: missing session');

  if (session.status === 'ended') {
    return { ok: true, status: 'already_ended', cloudflare_video_uid: session.cloudflare_video_uid || null };
  }

  const now = new Date().toISOString();
  const shouldArchive = session.status === 'live' || !!session.post_id || !!session.live_post_id;
  const uid = shouldArchive ? await createReplayIfVideoExists(admin, session) : null;

  await admin.from('live_sessions').update({
    status: 'ended',
    ended_at: session.ended_at || now,
    recording_status: 'processing',
    processing_started_at: session.processing_started_at || now,
    source_disconnected_at: null,
    auto_end_at: null,
    source_connected: false,
    connection_status: 'ended',
    live_input_status: 'ended',
    preview_ready: false,
    end_reason: opts.reason || session.end_reason || 'manual',
    last_disconnected_at: session.last_disconnected_at || now,
    disconnected_at: session.disconnected_at || now,
    updated_at: now,
  }).eq('id', session.id);

  const postId = session.post_id || session.live_post_id;
  if (postId) {
    const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
    await admin.from('posts').update({
      metadata: {
        ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
        live_status: 'ended',
        archive_status: 'pending',
        playback_type: 'r2_pending',
        ...(opts.reason ? { end_reason: opts.reason } : {}),
      },
    }).eq('id', postId);
  }

  return { ok: true, status: 'ended', cloudflare_video_uid: uid };
}
