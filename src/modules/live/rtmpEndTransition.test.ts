import { describe, expect, it, vi } from 'vitest';
import { claimRtmpEndSession, runClaimedRtmpEndTransition } from '../../../supabase/functions/_shared/rtmpEndTransition';

function createAdminWithResponses(...responses: Array<{ data: unknown; error: unknown }>) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let responseIndex = 0;
  const builder: Record<string, any> = {};
  for (const method of ['update', 'eq', 'is', 'in', 'lt', 'select']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.maybeSingle = async () => responses[responseIndex++];
  return { admin: { from: vi.fn(() => builder) }, calls };
}

describe('runClaimedRtmpEndTransition', () => {
  it('runs side effects only after this worker claims the transition', async () => {
    const order: string[] = [];
    const runSideEffects = vi.fn(async () => {
      order.push('side-effects');
      return { ended: true, idempotent: false };
    });

    const result = await runClaimedRtmpEndTransition({
      claim: async () => {
        order.push('claim');
        return { id: 'session-1', status: 'ended' };
      },
      readCurrent: vi.fn(),
      runSideEffects,
      makeIdempotentResult: () => ({ ended: true, idempotent: true }),
    });

    expect(order).toEqual(['claim', 'side-effects']);
    expect(runSideEffects).toHaveBeenCalledOnce();
    expect(result).toEqual({ ended: true, idempotent: false });
  });

  it('reads the current row and returns idempotently without side effects when another worker won', async () => {
    const current = { id: 'session-1', status: 'ended', cloudflare_video_uid: 'video-1' };
    const readCurrent = vi.fn().mockResolvedValue(current);
    const runSideEffects = vi.fn();

    const result = await runClaimedRtmpEndTransition({
      claim: vi.fn().mockResolvedValue(null),
      readCurrent,
      runSideEffects,
      makeIdempotentResult: (row) => ({ ended: true, idempotent: true, row }),
    });

    expect(readCurrent).toHaveBeenCalledOnce();
    expect(runSideEffects).not.toHaveBeenCalled();
    expect(result).toEqual({ ended: true, idempotent: true, row: current });
  });

  it('does not run side effects when claiming fails', async () => {
    const runSideEffects = vi.fn();
    const claimError = new Error('database unavailable');

    await expect(runClaimedRtmpEndTransition({
      claim: vi.fn().mockRejectedValue(claimError),
      readCurrent: vi.fn(),
      runSideEffects,
      makeIdempotentResult: () => ({ ended: true, idempotent: true }),
    })).rejects.toThrow('database unavailable');

    expect(runSideEffects).not.toHaveBeenCalled();
  });
});

describe('claimRtmpEndSession', () => {
  it('conditionally claims an active session before any caller side effect', async () => {
    const claimed = { id: 'session-1', status: 'ending' };
    const { admin, calls } = createAdminWithResponses({ data: claimed, error: null });

    await expect(claimRtmpEndSession(admin, 'session-1', 'claim-a', 'manual', 'now', 'stale-before')).resolves.toEqual(claimed);

    expect(calls).toContainEqual({ method: 'update', args: [{ status: 'ending', end_reason: 'manual', end_claim_token: 'claim-a', updated_at: 'now' }] });
    expect(calls).toContainEqual({ method: 'is', args: ['ended_at', null] });
    expect(calls).toContainEqual({ method: 'in', args: ['status', expect.arrayContaining(['live', 'disconnect_grace'])] });
  });

  it('can reclaim only an ending row whose updated_at lease has expired', async () => {
    const claimed = { id: 'session-1', status: 'ending' };
    const { admin, calls } = createAdminWithResponses(
      { data: null, error: null },
      { data: claimed, error: null },
    );

    await expect(claimRtmpEndSession(admin, 'session-1', 'claim-b', 'manual', 'now', 'stale-before')).resolves.toEqual(claimed);

    expect(calls).toContainEqual({ method: 'eq', args: ['status', 'ending'] });
    expect(calls).toContainEqual({ method: 'update', args: [{ status: 'ending', end_claim_token: 'claim-b', updated_at: 'now' }] });
    expect(calls).toContainEqual({ method: 'lt', args: ['updated_at', 'stale-before'] });
  });

  it('throws a database claim error before a caller can run side effects', async () => {
    const error = new Error('claim failed');
    const { admin } = createAdminWithResponses({ data: null, error });

    await expect(claimRtmpEndSession(admin, 'session-1', 'claim-a', 'manual', 'now', 'stale-before')).rejects.toBe(error);
  });
});
