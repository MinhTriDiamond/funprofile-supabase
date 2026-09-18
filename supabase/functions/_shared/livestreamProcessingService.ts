/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { archiveReplay } from './archiveReplayService.ts';
import { getStreamPlaybackUrls, requestMp4Download } from './cloudflareStreamService.ts';
import { createOrUpdateInstantReplayPost } from './replayFeedService.ts';

export interface MarkStreamReadyInput {
  replay: any;
  uid: string;
  video?: any;
  event?: any;
  mp4Url?: string | null;
}

function durationFrom(input: MarkStreamReadyInput): number | null {
  const value = input.video?.duration || input.event?.duration || input.event?.data?.duration || 0;
  return Math.round(Number(value || 0)) || null;
}

export async function markStreamReadyAndArchive(
  admin: SupabaseClient,
  input: MarkStreamReadyInput,
): Promise<Record<string, unknown>> {
  const urls = getStreamPlaybackUrls(input.uid);
  const mp4 = input.mp4Url ? { url: input.mp4Url } : await requestMp4Download(input.uid).catch(() => null);
  const now = new Date().toISOString();

  await (admin as any).from('live_replays').update({
    status: 'ready',
    playback_hls: urls.hls,
    playback_dash: urls.dash,
    playback_mp4: mp4?.url || urls.mp4,
    thumbnail_url: urls.thumbnail,
    duration_seconds: durationFrom(input),
    cloudflare_video_uid: input.uid,
    cloudflare_playback_url: urls.hls,
    cloudflare_mp4_download_url: mp4?.url || urls.mp4,
    archive_status: 'pending',
    archive_error: null,
    webhook_received_at: input.event ? now : input.replay.webhook_received_at,
    last_webhook_event: input.event ? 'ready' : input.replay.last_webhook_event,
    last_cf_status: 'ready',
    last_cf_response: input.video || input.event || null,
    error_message: null,
    last_error_at: null,
  }).eq('id', input.replay.id);

  await admin.from('live_sessions').update({
    recording_status: 'ready',
    recording_ready_at: now,
    recording_error: null,
  }).eq('id', input.replay.live_session_id);

  const postId = await createOrUpdateInstantReplayPost(admin, {
    ...input.replay,
    stream_uid: input.uid,
    cloudflare_video_uid: input.uid,
    cloudflare_playback_url: urls.hls,
    playback_hls: urls.hls,
    playback_dash: urls.dash,
    playback_mp4: mp4?.url || urls.mp4,
    thumbnail_url: urls.thumbnail,
    archive_status: 'pending',
  }, urls.hls);

  if (postId) {
    await (admin as any).from('live_replays').update({
      replay_post_id: postId,
      auto_posted_at: input.replay.auto_posted_at || now,
      posted_at: input.replay.posted_at || now,
    }).eq('id', input.replay.id);
  }

  return archiveReplay(admin, input.replay.id);
}
