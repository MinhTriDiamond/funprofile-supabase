import type { PostData, PostMetadata } from './types';
import { isLiveLikePost } from './livePostDetection';

export type PostPlaybackType = 'live_replay' | 'video' | 'live' | 'none';
export type PostPlaybackStatus = 'ready' | 'processing' | 'failed' | 'live' | 'none';

export interface PostPlayback {
  type: PostPlaybackType;
  status: PostPlaybackStatus;
  url: string | null;
  thumbnailUrl: string | null;
  provider: string | null;
  sourceField: string | null;
}

interface PlaybackCandidate {
  field: string;
  value: unknown;
  provider?: string | null;
}

export interface PostPlaybackOverrides {
  metadata?: PostMetadata | null;
  liveSession?: Record<string, unknown> | null;
  liveReplay?: Record<string, unknown> | null;
  replayOverride?: Record<string, unknown> | null;
  fallbackUrl?: string | null;
}

type UnknownPost = Partial<PostData> & Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isHlsUrl(url: string): boolean {
  return /\.m3u8(?:\?|$)/i.test(url);
}

function isLiveLike(post: UnknownPost, metadata: Record<string, unknown>): boolean {
  return isLiveLikePost(post, metadata);
}

function isAgoraWebcamReplay(metadata: Record<string, unknown>, post: UnknownPost): boolean {
  return metadata.live_mode === 'agora_webcam'
    || metadata.recording_provider === 'agora'
    || post.recording_provider === 'agora'
    || post.live_mode === 'agora_webcam';
}

function isRtmpReplay(metadata: Record<string, unknown>, post: UnknownPost): boolean {
  return metadata.live_mode === 'rtmp_obs'
    || metadata.mode === 'rtmp_obs'
    || post.live_mode === 'rtmp_obs'
    || post.mode === 'rtmp_obs'
    || metadata.playback_provider === 'cloudflare_temp'
    || post.playback_provider === 'cloudflare_temp'
    || metadata.storage_provider === 'cloudflare_stream'
    || post.storage_provider === 'cloudflare_stream';
}

function isCloudflareTempCandidate(candidate: PlaybackCandidate, url: string): boolean {
  const looksCloudflareTempUrl = isHlsUrl(url)
    || /(?:customer-[a-z0-9]+\.cloudflarestream\.com|videodelivery\.net)\//i.test(url);
  return ((candidate.provider === 'cloudflare_temp' || candidate.provider === 'cloudflare_stream') && looksCloudflareTempUrl)
    || candidate.field.includes('playback_hls')
    || candidate.field.includes('cloudflare_playback_url');
}

function firstPlayableCandidate(
  candidates: PlaybackCandidate[],
  skipHls: boolean,
  skipCloudflareTemp: boolean,
): PlaybackCandidate | null {
  for (const candidate of candidates) {
    const url = stringValue(candidate.value);
    if (!url) continue;
    if (skipHls && isHlsUrl(url)) continue;
    if (skipCloudflareTemp && isCloudflareTempCandidate(candidate, url)) continue;
    return { ...candidate, value: url };
  }
  return null;
}

function thumbnailFrom(...values: unknown[]): string | null {
  for (const value of values) {
    const url = stringValue(value);
    if (!url) continue;
    if (/customer-[a-z0-9]+\.cloudflarestream\.com\/[^/]+\/thumbnails\//i.test(url)) continue;
    return url;
  }
  return null;
}

function recordingDefinitelyFailed(...values: unknown[]): boolean {
  // Chỉ tín hiệu recording/replay chắc chắn không có bản ghi mới coi là failed.
  // archive_status='failed' đơn lẻ KHÔNG đủ vì recording có thể vẫn đang xử lý
  // hoặc temp R2 / playback_hls vẫn dùng được.
  return values.some((value) => {
    const v = String(value || '');
    return v === 'failed' || v === 'failed_no_recording' || v === 'recording_failed' || v === 'not_started';
  });
}

function replayStatusIsProcessing(...values: unknown[]): boolean {
  return values.some((value) => [
    'pending',
    'processing',
    'recording_processing',
    'archiving',
    'queued',
    'acquiring',
    'starting',
    'stopping',
    'ending',
    'uploading_r2',
    'verifying_r2',
    'copying',
    'processing_replay',
  ].includes(String(value || '')));
}

function liveStatusIsTerminal(...values: unknown[]): boolean {
  return values.some((value) => [
    'ended',
    'ending',
    'recording_processing',
    'recording_failed',
    'processing_replay',
    'failed',
  ].includes(String(value || '')));
}

function liveStatusIsActive(...values: unknown[]): boolean {
  return values.some((value) => ['live', 'reconnecting', 'disconnect_grace'].includes(String(value || '')));
}

export function getPostPlayback(post: UnknownPost, overrides: PostPlaybackOverrides = {}): PostPlayback {
  const metadata = {
    ...(isRecord(post.metadata) ? post.metadata : {}),
    ...(isRecord(overrides.metadata) ? overrides.metadata : {}),
  };
  const liveSession = isRecord(overrides.liveSession)
    ? overrides.liveSession
    : isRecord(post.live_session)
      ? post.live_session
      : {};
  const liveReplay = isRecord(overrides.liveReplay)
    ? overrides.liveReplay
    : isRecord(post.live_replay)
      ? post.live_replay
      : isRecord(post.live_replays)
        ? post.live_replays
        : {};
  const replayOverride = isRecord(overrides.replayOverride) ? overrides.replayOverride : {};
  const mediaVideo = Array.isArray(post.media_urls)
    ? post.media_urls.find((item) => isRecord(item) && item.type === 'video' && stringValue(item.url))
    : null;
  const mediaObject = isRecord(post.media) ? post.media : {};
  const liveLike = isLiveLike(post, metadata);
  const rtmpReplay = liveLike && isRtmpReplay(metadata, post);
  const skipHls = liveLike && (isAgoraWebcamReplay(metadata, post) || rtmpReplay);
  const skipCloudflareTemp = rtmpReplay;
  const hasTerminalLiveSignal = Boolean(post.ended_at || metadata.ended_at || liveSession.ended_at)
    || liveStatusIsTerminal(
      post.status,
      post.live_status,
      metadata.status,
      metadata.live_status,
      liveSession.status,
    );
  const activeLive = liveStatusIsActive(
    post.status,
    post.live_status,
    metadata.status,
    metadata.live_status,
    liveSession.status,
  ) && !hasTerminalLiveSignal;
  const implicitActiveLive = post.post_type === 'live' && !hasTerminalLiveSignal;

  const candidate = firstPlayableCandidate([
    { field: 'post.playback_url', value: post.playback_url, provider: post.playback_provider as string | null },
    { field: 'metadata.playback_url', value: metadata.playback_url, provider: metadata.playback_provider as string | null },
    { field: 'post.archive_url', value: post.archive_url, provider: 'r2' },
    { field: 'metadata.archive_url', value: metadata.archive_url, provider: 'r2' },
    { field: 'metadata.archive_mp4_url', value: metadata.archive_mp4_url, provider: 'r2' },
    { field: 'replayOverride.archive_mp4_url', value: replayOverride.archive_mp4_url, provider: 'r2' },
    { field: 'liveReplay.archive_mp4_url', value: liveReplay.archive_mp4_url, provider: 'r2' },
    { field: 'post.replay_url', value: post.replay_url, provider: 'r2' },
    { field: 'metadata.replay_url', value: metadata.replay_url, provider: 'r2' },
    { field: 'liveSession.replay_url', value: liveSession.replay_url, provider: 'r2' },
    { field: 'post.video_url', value: post.video_url, provider: post.playback_provider as string | null },
    { field: 'metadata.video_url', value: metadata.video_url, provider: metadata.playback_provider as string | null },
    { field: 'metadata.r2_video_url', value: metadata.r2_video_url, provider: 'r2' },
    { field: 'replayOverride.r2_video_url', value: replayOverride.r2_video_url, provider: 'r2' },
    { field: 'liveReplay.r2_video_url', value: liveReplay.r2_video_url, provider: 'r2' },
    { field: 'metadata.playback_mp4', value: metadata.playback_mp4, provider: 'r2' },
    { field: 'replayOverride.playback_mp4', value: replayOverride.playback_mp4, provider: 'r2' },
    { field: 'liveReplay.playback_mp4', value: liveReplay.playback_mp4, provider: 'r2' },
    { field: 'post.media_url', value: post.media_url },
    { field: 'metadata.media_url', value: metadata.media_url },
    { field: 'post.media.url', value: mediaObject.url },
    { field: 'post.media_urls.video.url', value: isRecord(mediaVideo) ? mediaVideo.url : null },
    { field: 'liveSession.archive_url', value: liveSession.archive_url, provider: 'r2' },
    { field: 'liveSession.r2_video_url', value: liveSession.r2_video_url, provider: 'r2' },
    { field: 'liveSession.playback_mp4', value: liveSession.playback_mp4, provider: 'r2' },
    { field: 'liveSession.playback_url', value: liveSession.playback_url, provider: liveSession.playback_provider as string | null },
    { field: 'liveReplay.playback_url', value: liveReplay.playback_url, provider: liveReplay.playback_provider as string | null },
    { field: 'fallbackUrl', value: overrides.fallbackUrl },
  ], skipHls, skipCloudflareTemp);

  const thumbnailUrl = thumbnailFrom(
    post.thumbnail_url,
    metadata.thumbnail_url,
    liveReplay.thumbnail_url,
    liveSession.thumbnail_url,
  );

  if (candidate?.value) {
    if (liveLike && activeLive && isHlsUrl(candidate.value as string)) {
      return {
        type: 'live',
        status: 'live',
        url: candidate.value as string,
        thumbnailUrl,
        provider: candidate.provider || stringValue(metadata.playback_provider) || stringValue(post.playback_provider) || null,
        sourceField: candidate.field,
      };
    }

    return {
      type: liveLike || post.post_type === 'live_replay' ? 'live_replay' : 'video',
      status: 'ready',
      url: candidate.value as string,
      thumbnailUrl,
      provider: candidate.provider || stringValue(metadata.playback_provider) || stringValue(post.playback_provider) || null,
      sourceField: candidate.field,
    };
  }

  // Recording chỉ chắc chắn "failed" khi tín hiệu thực sự đến từ recording/replay,
  // KHÔNG tính archive_status. Archive fail mà recording vẫn processing → vẫn coi là processing.
  const recordingFailed = recordingDefinitelyFailed(
    post.replay_status,
    post.recording_status,
    metadata.replay_status,
    metadata.recording_status,
    liveSession.recording_status,
    liveReplay.replay_status,
  );

  const processingSignal = replayStatusIsProcessing(
    post.replay_status,
    post.status,
    post.recording_status,
    metadata.replay_status,
    metadata.recording_status,
    metadata.archive_status,
    liveSession.status,
    liveSession.recording_status,
    liveReplay.replay_status,
    liveReplay.status,
    liveReplay.archive_status,
  );

  // Processing thắng failed: chỉ trả failed khi không còn pipeline nào đang chạy.
  if (recordingFailed && !processingSignal && liveLike) {
    return { type: 'live_replay', status: 'failed', url: null, thumbnailUrl, provider: null, sourceField: null };
  }

  if (liveLike && (activeLive || implicitActiveLive)) {
    return { type: 'live', status: 'live', url: null, thumbnailUrl, provider: null, sourceField: null };
  }

  if (processingSignal || liveLike) {
    return { type: 'live_replay', status: 'processing', url: null, thumbnailUrl, provider: null, sourceField: null };
  }


  return { type: 'none', status: 'none', url: null, thumbnailUrl, provider: null, sourceField: null };
}
