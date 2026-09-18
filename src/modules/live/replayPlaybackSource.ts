export type ReplayPlaybackStatus = 'processing' | 'ready_hls' | 'archiving' | 'ready_mp4' | 'failed' | 'failed_no_recording' | 'ready' | string | null | undefined;

export interface ReplayPlaybackSourceInput {
  replayStatus?: ReplayPlaybackStatus;
  archiveMp4Url?: string | null;
  r2VideoUrl?: string | null;
  playbackMp4?: string | null;
  playbackUrl?: string | null;
  postVideoUrl?: string | null;
  tempHlsUrl?: string | null;
  playbackHls?: string | null;
  chunkedFallbackUrl?: string | null;
}

export interface ReplayPlaybackSource {
  url?: string;
  type: 'mp4' | 'hls' | 'processing' | 'failed';
}

function isMp4Like(url?: string | null): url is string {
  return !!url && !/\.m3u8(?:\?|$)/i.test(url);
}

export function resolveReplayPlaybackSource(input: ReplayPlaybackSourceInput): ReplayPlaybackSource {
  if (input.replayStatus === 'failed' || input.replayStatus === 'failed_no_recording') return { type: 'failed' };

  const archiveUrl = input.archiveMp4Url || input.r2VideoUrl || input.playbackMp4;
  if (input.replayStatus === 'ready_mp4' && archiveUrl) {
    return { type: 'mp4', url: archiveUrl };
  }

  if (input.replayStatus === 'ready_mp4' && isMp4Like(input.postVideoUrl)) {
    return { type: 'mp4', url: input.postVideoUrl };
  }

  const hlsUrl = input.tempHlsUrl || input.playbackHls || (/\.m3u8(?:\?|$)/i.test(input.playbackUrl || '') ? input.playbackUrl : null);
  if ((input.replayStatus === 'ready_hls' || input.replayStatus === 'archiving') && hlsUrl) {
    return { type: 'hls', url: hlsUrl };
  }

  if (input.replayStatus === 'ready' && archiveUrl) return { type: 'mp4', url: archiveUrl };
  if (input.replayStatus === 'ready' && hlsUrl) return { type: 'hls', url: hlsUrl };
  if (input.chunkedFallbackUrl) return { type: 'hls', url: input.chunkedFallbackUrl };
  return { type: input.replayStatus === 'failed' || input.replayStatus === 'failed_no_recording' ? 'failed' : 'processing' };
}
