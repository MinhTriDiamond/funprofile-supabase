import { describe, expect, it } from 'vitest';
import { resolveReplayPlaybackSource } from './replayPlaybackSource';

describe('resolveReplayPlaybackSource', () => {
  it('prefers verified archive MP4 over temp HLS', () => {
    expect(resolveReplayPlaybackSource({
      replayStatus: 'ready_mp4',
      archiveMp4Url: 'https://archive.example/replay.mp4',
      tempHlsUrl: 'https://temp.example/replay.m3u8',
    })).toEqual({ type: 'mp4', url: 'https://archive.example/replay.mp4' });
  });

  it('uses temp HLS while archive is pending', () => {
    expect(resolveReplayPlaybackSource({
      replayStatus: 'ready_hls',
      tempHlsUrl: 'https://temp.example/replay.m3u8',
    })).toEqual({ type: 'hls', url: 'https://temp.example/replay.m3u8' });
  });

  it('keeps HLS during archiving failures when MP4 is not ready', () => {
    expect(resolveReplayPlaybackSource({
      replayStatus: 'archiving',
      playbackHls: 'https://temp.example/replay.m3u8',
    })).toEqual({ type: 'hls', url: 'https://temp.example/replay.m3u8' });
  });

  it('reports processing when no playable source exists yet', () => {
    expect(resolveReplayPlaybackSource({ replayStatus: 'processing' })).toEqual({ type: 'processing' });
  });

  it('reports failed without falling back to stale media', () => {
    expect(resolveReplayPlaybackSource({
      replayStatus: 'failed',
      tempHlsUrl: 'https://temp.example/replay.m3u8',
    })).toEqual({ type: 'failed' });
  });

  it('reports failed_no_recording without inventing media', () => {
    expect(resolveReplayPlaybackSource({
      replayStatus: 'failed_no_recording',
      postVideoUrl: 'https://archive.example/stale.mp4',
    })).toEqual({ type: 'failed' });
  });

  it('is idempotent for legacy ready rows with only R2 URL', () => {
    expect(resolveReplayPlaybackSource({
      replayStatus: 'ready',
      r2VideoUrl: 'https://archive.example/legacy.mp4',
    })).toEqual({ type: 'mp4', url: 'https://archive.example/legacy.mp4' });
  });
});
