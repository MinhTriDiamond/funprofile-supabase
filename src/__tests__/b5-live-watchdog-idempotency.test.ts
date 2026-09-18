import { describe, expect, it } from 'vitest';
import {
  isSettledLiveSession,
  shouldLogIdempotentReturn,
  shouldWatchdogForceEnd,
} from '../../supabase/functions/_shared/liveWatchdogIdempotency';

describe('B5-B live watchdog idempotency', () => {
  it('phiên có ended_at bị coi là settled ⇒ watchdog không force-end lại', () => {
    const zombie = {
      id: 'ecd0cf3b-c3ce-4699-ae28-3d752996a518',
      status: 'processing_replay',
      ended_at: '2026-07-07T02:27:48.882Z',
      recording_status: 'ready',
      archive_status: 'replay_posted',
    };
    expect(isSettledLiveSession(zombie)).toBe(true);
    expect(shouldWatchdogForceEnd(zombie)).toBe(false);
  });

  it('phiên đang live thật vẫn được force-end khi quá trần', () => {
    const live = { id: 'x', status: 'live', ended_at: null, recording_status: 'recording' };
    expect(shouldWatchdogForceEnd(live)).toBe(true);
  });

  it('replay đã đăng ⇒ settled dù ended_at rỗng', () => {
    expect(shouldWatchdogForceEnd({ status: 'processing_replay', archive_status: 'replay_posted' })).toBe(false);
  });

  it('watchdog chạy lại nhiều lần trên phiên đã end ⇒ chỉ ghi log lần đầu', () => {
    let logged = 0;
    for (let tick = 0; tick < 60; tick += 1) {
      if (shouldLogIdempotentReturn(logged)) logged += 1;
    }
    expect(logged).toBe(1);
  });
});
