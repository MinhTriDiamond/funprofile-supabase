/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getStreamPlaybackUrls, listStreamLiveInputVideos, selectRtmpReplayVideoForSession, setStreamLiveInputEnabled } from './cloudflareStreamService.ts';
import { isRtmpSessionEndedOrFrozen } from './rtmpSessionStatus.ts';

const PROCESSING_MESSAGE = 'Đang tối ưu video replay trong nền. Bạn vẫn có thể xem lại ngay.';

export type RtmpEndReason =
  | 'manual'
  | 'disconnect_timeout'
  | 'obs_signal_lost_timeout'
  | 'cloudflare_error'
  | 'admin_force'
  | 'duration_limit';

export function getObsReconnectTimeoutSeconds(): number {
  const raw = Number(Deno.env.get('OBS_RECONNECT_TIMEOUT_SECONDS') || '60');
  return Number.isFinite(raw) && raw > 0 ? raw : 60;
}

/**
 * Poll ngắn 8 lần × 1.5s để bắt UID của Cloudflare Live Input video sau khi user end live.
 * Cloudflare thường mất 2-8s để materialize VOD UID; nếu chỉ list 1 lần sẽ miss và phải chờ
 * cron 2 phút mới có instant replay post. Trả null nếu hết retry vẫn chưa có UID.
 */
async function pollLiveInputVideoForReplay(
  inputId: string,
  session: any,
  preferredUid: string | null | undefined,
  opts: { tries?: number; intervalMs?: number } = {},
): Promise<{ uid: string; video: any } | null> {
  const tries = Math.max(1, opts.tries ?? 8);
  const intervalMs = Math.max(250, opts.intervalMs ?? 1500);
  for (let i = 0; i < tries; i++) {
    const videos = await listStreamLiveInputVideos(inputId).catch(() => []);
    if (videos.length > 0) {
      const selection = selectRtmpReplayVideoForSession(videos as any, session, preferredUid, {
        skewSeconds: 60,
        afterEndMinutes: 10,
      });
      if (selection.video && selection.uid) {
        return { uid: selection.uid, video: selection.video };
      }
      console.warn('[RTMP_INSTANT_REPLAY_STRICT_SELECT_MISS]', {
        live_session_id: session?.id,
        live_input_id: inputId,
        preferredUid: preferredUid || null,
        reason: selection.reason,
        candidates: selection.candidates,
        rejected: selection.rejected.slice(0, 5),
      });
      // Ưu tiên video thuộc phiên hiện tại (created >= armed_at - 60s), sau đó fallback newest.
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export async function createRtmpReplayIfVideoExists(admin: SupabaseClient, session: any): Promise<string | null> {
  if (!session.cloudflare_live_input_id) return null;
  const polled = await pollLiveInputVideoForReplay(
    session.cloudflare_live_input_id,
    session,
    session.cloudflare_video_uid || null,
    { tries: 8, intervalMs: 1500 },
  );
  const video = polled?.video || null;
  const uid = String(polled?.uid || '');
  if (!uid) {
    console.warn('[RTMP_INSTANT_REPLAY_NO_UID]', {
      live_session_id: session.id,
      live_input_id: session.cloudflare_live_input_id,
      armed_at: session.armed_at,
      hint: 'Cloudflare chưa materialize VOD; cron recoverMissingRtmpReplays sẽ retry.',
    });
    return null;
  }

  const urls = getStreamPlaybackUrls(uid);
  await (admin as any)
    .from('live_sessions')
    .update({
      cloudflare_video_uid: uid,
      hls_url: session.hls_url && String(session.hls_url).includes(uid) ? session.hls_url : urls.hls,
      playback_url: session.playback_url && String(session.playback_url).includes(uid) ? session.playback_url : urls.hls,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  const { data: replay } = await (admin as any).from('live_replays').upsert({
    live_session_id: session.id,
    user_id: session.owner_id || session.host_user_id || session.user_id,
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
    last_cf_response: video || null,
  }, { onConflict: 'chunked_recording_id' }).select('*').single();

  if (replay) {
    console.log('[RTMP_REPLAY_VOD_READY_ARCHIVE_PENDING]', {
      live_session_id: session.id,
      replay_id: replay.id,
      playbackProvider: 'cloudflare_temp_internal',
      cloudflareVideoUidExists: !!uid,
      note: 'Cloudflare HLS is kept internal; feed post stays processing until R2 MP4 is verified.',
    });
  }

  return uid;
}

export async function endRtmpLiveSession(
  admin: SupabaseClient,
  session: any,
  reason: RtmpEndReason,
): Promise<{ ended: boolean; idempotent: boolean; cloudflare_video_uid: string | null; disable_error: string | null }> {
  const now = new Date().toISOString();
  const postId = session.post_id || session.live_post_id || null;
  const shouldArchivePublicLive = session.status === 'live' || !!postId;

  if (isRtmpSessionEndedOrFrozen(session) && session.ended_at) {
    return {
      ended: true,
      idempotent: true,
      cloudflare_video_uid: session.cloudflare_video_uid || null,
      disable_error: session.live_input_disable_error || null,
    };
  }

  let disableError: string | null = null;
  if (session.cloudflare_live_input_id) {
    try {
      await setStreamLiveInputEnabled(session.cloudflare_live_input_id, false);
    } catch (error) {
      disableError = error instanceof Error ? error.message : String(error);
      console.warn('[RTMP_END_LIVE_INPUT_DISABLE_FAILED]', {
        live_session_id: session.id,
        live_input_id: session.cloudflare_live_input_id,
        reason,
        error: disableError,
      });
    }
  }

  const uid = shouldArchivePublicLive ? await createRtmpReplayIfVideoExists(admin, session) : (session.cloudflare_video_uid || null);

  // State machine: ended → replay_temp_ready (nếu CF đã có UID) → archive cron sẽ chuyển tiếp.
  const nextStatus = reason === 'obs_signal_lost_timeout'
    ? 'ended'
    : (shouldArchivePublicLive && uid ? 'replay_temp_ready' : 'ended');
  const isAutoEnd = reason !== 'manual' && reason !== 'host_clicked_end';
  await (admin as any).from('live_sessions').update({
    status: nextStatus,
    connection_status: 'ended',
    ended_at: session.ended_at || now,
    end_reason: reason,
    auto_end_reason: isAutoEnd ? reason : session.auto_end_reason ?? null,
    source_connected: false,
    last_disconnected_at: session.last_disconnected_at || now,
    signal_status: reason === 'obs_signal_lost_timeout' ? 'timeout_auto_end' : (isAutoEnd ? 'ended' : 'ended'),
    signal_lost_at: session.signal_lost_at || (reason === 'obs_signal_lost_timeout' ? (session.last_disconnected_at || now) : session.signal_lost_at),
    reconnect_deadline_at: null,
    recording_status: shouldArchivePublicLive ? 'processing' : session.recording_status,
    processing_started_at: shouldArchivePublicLive ? (session.processing_started_at || now) : session.processing_started_at,
    archive_status: shouldArchivePublicLive ? 'pending' : session.archive_status,
    archive_error: null,
    playback_provider: shouldArchivePublicLive && uid ? 'cloudflare_temp' : session.playback_provider,
    storage_provider: shouldArchivePublicLive && uid ? 'cloudflare_stream' : session.storage_provider,
    playback_url: uid ? getStreamPlaybackUrls(uid).hls : session.playback_url,
    cloudflare_video_uid: uid || session.cloudflare_video_uid,
    live_input_disabled_at: session.cloudflare_live_input_id ? now : session.live_input_disabled_at,
    live_input_disable_error: disableError,
    is_input_armed: false,
    armed_session_token: null,
    last_armed_heartbeat_at: null,
    updated_at: now,
  }).eq('id', session.id);

  if (postId) {
    const { data: post } = await (admin as any).from('posts').select('metadata').eq('id', postId).maybeSingle();
    const { error: postUpdErr } = await (admin as any).from('posts').update({
      post_type: 'live_replay',
      video_url: null,
      replay_status: 'processing',
      playback_provider: 'r2',
      replay_ready: false,
      processing_message: PROCESSING_MESSAGE,
      metadata: {
        ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
        live_status: 'ended',
        live_mode: 'rtmp_obs',
        live_session_id: session.id,
        end_reason: reason,
        archive_status: 'pending',
        playback_url: null,
        playback_hls: null,
        playback_type: 'r2_pending',
        playback_provider: 'r2',
        storage_provider: 'r2',
        replay_status: 'processing',
        replay_ready: false,
        replay_source: 'r2_pending',
        cloudflare_playback_url: null,
        cloudflare_video_uid: uid || session.cloudflare_video_uid || null,
        stream_uid: uid || session.cloudflare_video_uid || null,
        processing_message: PROCESSING_MESSAGE,
      },
      updated_at: now,
    }).eq('id', postId);
    if (postUpdErr) console.error('[RTMP_END_POST_UPDATE_FAILED]', { postId, error: postUpdErr.message });
  }

  console.log('[RTMP_END_LIVE_SESSION]', {
    live_session_id: session.id,
    reason,
    hasPost: !!postId,
    hasCloudflareVideoUid: !!uid,
    inputDisabled: !!session.cloudflare_live_input_id && !disableError,
    disableError: !!disableError,
  });

  return { ended: true, idempotent: false, cloudflare_video_uid: uid || session.cloudflare_video_uid || null, disable_error: disableError };
}

export function getDisconnectGraceSeconds(): number {
  const raw = Number(Deno.env.get('RTMP_DISCONNECT_GRACE_SECONDS') || '180');
  return Number.isFinite(raw) && raw > 0 ? raw : 180;
}

export function getDisconnectGraceMinutes(): number {
  return Math.max(1, Math.ceil(getDisconnectGraceSeconds() / 60));
}

export function disconnectGraceExpired(lastDisconnectedAt: string | null | undefined, graceSeconds = getDisconnectGraceSeconds()): boolean {
  if (!lastDisconnectedAt) return false;
  const disconnectedAt = new Date(lastDisconnectedAt).getTime();
  if (!Number.isFinite(disconnectedAt)) return false;
  return Date.now() - disconnectedAt >= graceSeconds * 1000;
}
