import { describe, expect, it, vi } from 'vitest';
import { canBeginCall, cleanupCallAttempt, isCurrentCallAttempt, isRecentRingingCall, mayMarkMissed, mayTransitionToConnected } from './callLifecycle';

describe('call lifecycle fencing', () => {
  it('rejects duplicate starts while a transition or call is active', () => {
    expect(canBeginCall('idle', false)).toBe(true);
    expect(canBeginCall('idle', true)).toBe(false);
    expect(canBeginCall('connected', false)).toBe(false);
  });
  it('ignores delayed callbacks from an older call generation', () => {
    const current = { sessionId: 'B', generation: 2 };
    const stale = { sessionId: 'A', generation: 1 };
    expect(isCurrentCallAttempt(current, stale)).toBe(false);
    expect(mayTransitionToConnected('active', current, stale)).toBe(false);
    expect(mayMarkMissed('ringing', current, stale)).toBe(false);
  });
  it('transitions only current ringing sessions and handles terminal database results', () => {
    const current = { sessionId: 'A', generation: 1 };
    expect(mayMarkMissed('ringing', current, current)).toBe(true);
    expect(mayMarkMissed('active', current, current)).toBe(false);
    expect(mayTransitionToConnected('active', current, current)).toBe(true);
    expect(mayTransitionToConnected('ended', current, current)).toBe(false);
  });
  it('treats only ringing calls inside the product timeout window as incoming', () => {
    const now = Date.parse('2026-10-17T12:00:00Z');
    expect(isRecentRingingCall('ringing', '2026-10-17T11:59:30Z', now, 45_000)).toBe(true);
    expect(isRecentRingingCall('ringing', '2026-10-17T11:59:00Z', now, 45_000)).toBe(false);
    expect(isRecentRingingCall('active', '2026-10-17T11:59:30Z', now, 45_000)).toBe(false);
    expect(isRecentRingingCall('ringing', 'invalid', now, 45_000)).toBe(false);
  });
  it('cleans tracks, RTC and timers even when one cleanup step fails', async () => {
    const closeTracks = vi.fn(() => { throw new Error('track cleanup'); });
    const leaveRtc = vi.fn();
    const clearTimers = vi.fn();
    const markEnded = vi.fn();
    const dbFinalized = await cleanupCallAttempt({ sessionId: 'A', generation: 1 }, { closeTracks, leaveRtc, clearTimers, markEnded });
    expect(closeTracks).toHaveBeenCalledOnce();
    expect(leaveRtc).toHaveBeenCalledWith('A');
    expect(clearTimers).toHaveBeenCalledOnce();
    expect(markEnded).toHaveBeenCalledWith('A');
    expect(dbFinalized).toBe(true);
  });
});
