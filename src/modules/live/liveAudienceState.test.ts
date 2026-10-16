import { describe, expect, it } from 'vitest';
import { resolveLiveAudienceState } from './liveAudienceState';

const base = {
  loading: false,
  resolving: false,
  hasSessionId: true,
  hasSession: true,
  isRtmp: true,
  paused: false,
  hasRemoteVideo: false,
};

describe('resolveLiveAudienceState', () => {
  it('keeps reconnecting ahead of a stale replay URL', () => {
    expect(resolveLiveAudienceState({ ...base, status: 'reconnecting', replayUrl: 'https://old/replay.mp4' }))
      .toBe('reconnecting');
  });

  it('shows an end in progress instead of a stale replay', () => {
    expect(resolveLiveAudienceState({ ...base, status: 'ending', replayUrl: 'https://old/replay.mp4' }))
      .toBe('processing_replay');
  });

  it('shows an archived replay after the session ends', () => {
    expect(resolveLiveAudienceState({ ...base, status: 'ended', replayUrl: 'https://archive/replay.mp4' }))
      .toBe('replay_ready');
  });
});
