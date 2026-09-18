import { describe, expect, it } from 'vitest';
import { getProfileLiveState } from './getProfileLiveState';

describe('getProfileLiveState', () => {
  it('returns live only when profile cache has a live session id', () => {
    expect(getProfileLiveState({
      is_live: true,
      current_live_session_id: 'session-1',
      live_started_at: '2026-06-03T00:00:00.000Z',
    })).toEqual({
      isLive: true,
      liveSessionId: 'session-1',
      liveStartedAt: '2026-06-03T00:00:00.000Z',
    });
  });

  it('does not show live when the cache flag is stale without a session id', () => {
    expect(getProfileLiveState({
      is_live: true,
      current_live_session_id: null,
      live_started_at: '2026-06-03T00:00:00.000Z',
    })).toEqual({
      isLive: false,
      liveSessionId: null,
      liveStartedAt: '2026-06-03T00:00:00.000Z',
    });
  });
});
