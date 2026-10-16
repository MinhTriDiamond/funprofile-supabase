import { describe, expect, it, vi } from 'vitest';
import {
  commitFencedRtmpEnd,
  disableLiveInputWithConfirmation,
  finalizeClaimedRtmpEnd,
  retryRtmpLiveInputDisableCandidates,
} from '../../../supabase/functions/_shared/rtmpEndTransition';

const finalization = (claimToken: string) => ({
  sessionId: 'session-1',
  claimToken,
  sessionPatch: { status: 'replay_temp_ready', ended_at: '2026-10-16T10:00:00Z' },
  postId: 'post-1',
  postPatch: { post_type: 'live_replay', replay_status: 'processing' },
  replayPatch: { stream_uid: 'video-1' },
});

describe('RTMP end claim fencing', () => {
  it('prevents a worker whose lease was replaced from finalizing or writing DB effects', async () => {
    const db = {
      claimToken: 'worker-b',
      session: { status: 'ending', ended_at: null },
      post: { post_type: 'live', replay_status: null },
      replays: new Map<string, unknown>(),
    };
    const admin = {
      rpc: vi.fn(async (_name: string, args: Record<string, any>) => {
        if (args.p_claim_token !== db.claimToken || db.session.status !== 'ending' || db.session.ended_at) {
          return { data: false, error: null };
        }
        db.post = { ...db.post, ...args.p_post_patch };
        if (args.p_replay_patch) db.replays.set(args.p_live_session_id, args.p_replay_patch);
        db.session = args.p_session_patch;
        return { data: true, error: null };
      }),
    };

    const workerAResult = await finalizeClaimedRtmpEnd(
      async () => ({ committed: await commitFencedRtmpEnd(admin, finalization('worker-a')), value: 'worker-a' }),
      async () => ({ ended: db.session.status !== 'ending', idempotent: true, status: db.session.status }),
    );
    expect(workerAResult).toEqual({ ended: false, idempotent: true, status: 'ending' });
    expect(db.session).toEqual({ status: 'ending', ended_at: null });
    expect(db.post).toEqual({ post_type: 'live', replay_status: null });
    expect(db.replays.size).toBe(0);

    await expect(commitFencedRtmpEnd(admin, finalization('worker-b'))).resolves.toBe(true);
    expect(db.session.status).toBe('replay_temp_ready');
    expect(db.post).toMatchObject({ post_type: 'live_replay', replay_status: 'processing' });
    expect(db.replays.size).toBe(1);
  });
});

describe('Cloudflare Live Input disable retry', () => {
  it('does not retry session A after its failed disable when session B reuses its persistent input', async () => {
    const disable = vi.fn(async () => ({ disabledAt: 'confirmed-time', error: null }));
    const persist = vi.fn(async () => undefined);
    const markSkipped = vi.fn(async () => undefined);

    const result = await retryRtmpLiveInputDisableCandidates(
      [{ id: 'session-a', cloudflare_live_input_id: 'shared-input', is_persistent_stream: true }],
      new Set(['shared-input']),
      new Set(['shared-input']),
      disable,
      persist,
      markSkipped,
    );

    expect(result).toEqual({ attempted: 0, disabled: 0, failed: 0, skippedInUse: 1 });
    expect(disable).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(markSkipped).toHaveBeenCalledWith('session-a');
  });

  it('never retries an input owned by a persistent session even if its config reference changed', async () => {
    const disable = vi.fn(async () => ({ disabledAt: 'confirmed-time', error: null }));
    const persist = vi.fn(async () => undefined);
    const markSkipped = vi.fn(async () => undefined);

    const result = await retryRtmpLiveInputDisableCandidates(
      [{ id: 'persistent-session', cloudflare_live_input_id: 'rotated-input', is_persistent_stream: true }],
      new Set(),
      new Set(),
      disable,
      persist,
      markSkipped,
    );

    expect(result.skippedInUse).toBe(1);
    expect(disable).not.toHaveBeenCalled();
    expect(markSkipped).toHaveBeenCalledWith('persistent-session');
  });

  it('retries disabling a dedicated input after its session ended', async () => {
    const disable = vi.fn(async () => ({ disabledAt: 'confirmed-time', error: null }));
    const persist = vi.fn(async () => undefined);

    const result = await retryRtmpLiveInputDisableCandidates(
      [{ id: 'session-a', cloudflare_live_input_id: 'dedicated-input' }],
      new Set(),
      new Set(),
      disable,
      persist,
    );

    expect(result).toEqual({ attempted: 1, disabled: 1, failed: 0, skippedInUse: 0 });
    expect(disable).toHaveBeenCalledWith('dedicated-input');
    expect(persist).toHaveBeenCalledWith('session-a', { disabledAt: 'confirmed-time', error: null });
  });

  it('records a disable timestamp only after a successful retry', async () => {
    const disable = vi.fn()
      .mockRejectedValueOnce(new Error('Cloudflare authorization: Bearer hidden-value'))
      .mockResolvedValueOnce({ enabled: false, status: 200 });

    const failed = await disableLiveInputWithConfirmation('input-1', disable, 'failed-time');
    expect(failed.disabledAt).toBeNull();
    expect(failed.error).not.toContain('hidden-value');

    const retried = await disableLiveInputWithConfirmation('input-1', disable, 'confirmed-time');
    expect(retried).toEqual({ disabledAt: 'confirmed-time', error: null });
    expect(disable).toHaveBeenCalledTimes(2);
  });
});

describe('atomic post and replay finalization', () => {
  it('leaves the ending claim retryable after post failure, then repairs the same post without duplicate replay', async () => {
    const db = {
      claimToken: 'worker-b',
      session: { status: 'ending', ended_at: null },
      post: { id: 'post-1', post_type: 'live', replay_status: null },
      replays: new Map<string, unknown>(),
    };
    let failPostOnce = true;
    const admin = {
      rpc: vi.fn(async (_name: string, args: Record<string, any>) => {
        if (args.p_claim_token !== db.claimToken || db.session.status !== 'ending' || db.session.ended_at) {
          return { data: false, error: null };
        }
        if (failPostOnce) {
          failPostOnce = false;
          return { data: null, error: new Error('post write failed') };
        }
        db.post = { ...db.post, ...args.p_post_patch };
        if (args.p_replay_patch) db.replays.set(args.p_live_session_id, args.p_replay_patch);
        db.session = args.p_session_patch;
        return { data: true, error: null };
      }),
    };

    await expect(commitFencedRtmpEnd(admin, finalization('worker-b'))).rejects.toThrow('post write failed');
    expect(db.session).toEqual({ status: 'ending', ended_at: null });
    expect(db.post.replay_status).toBeNull();
    expect(db.replays.size).toBe(0);

    await expect(commitFencedRtmpEnd(admin, finalization('worker-b'))).resolves.toBe(true);
    expect(db.post).toMatchObject({ id: 'post-1', post_type: 'live_replay', replay_status: 'processing' });
    expect(db.replays.size).toBe(1);
    expect(db.session.status).toBe('replay_temp_ready');
  });
});
