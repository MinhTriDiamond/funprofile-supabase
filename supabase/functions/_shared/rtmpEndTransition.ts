import { safeErrorText } from './safeErrorText.ts';

export interface ClaimedRtmpEndTransition<T, R> {
  /** Atomically update the eligible row and return it only if this worker won. */
  claim: () => Promise<T | null>;
  /** Read after a lost claim so the caller can return the persisted state. */
  readCurrent: () => Promise<T | null>;
  /** External/database side effects run only for the worker that claimed the row. */
  runSideEffects: (claimedRow: T) => Promise<R>;
  makeIdempotentResult: (currentRow: T | null) => R;
}

export const RTMP_END_CLAIMABLE_STATUSES = [
  'idle',
  'preparing',
  'waiting_for_obs',
  'source_connected',
  'ready_to_go_live',
  'live',
  'disconnect_grace',
  'reconnecting',
  'created',
  'starting',
  'recording',
] as const;
export const RTMP_END_CLAIM_LEASE_MS = 3 * 60 * 1000;

export async function disableLiveInputWithConfirmation(
  inputId: string,
  disable: (inputId: string) => Promise<{ enabled: boolean; status: number }>,
  now: string,
): Promise<{ disabledAt: string | null; error: string | null }> {
  try {
    const response = await disable(inputId);
    if (response.enabled !== false || response.status < 200 || response.status >= 300) {
      throw new Error(`Cloudflare did not confirm disabling the Live Input (HTTP ${response.status})`);
    }
    return { disabledAt: now, error: null };
  } catch (error) {
    return { disabledAt: null, error: safeErrorText(error) };
  }
}

export interface PendingRtmpLiveInputDisable {
  id: string;
  cloudflare_live_input_id: string;
  is_persistent_stream?: boolean | null;
}

/**
 * Retry only dedicated inputs that are not durably configured or referenced by
 * another live session. Persistent input IDs must never be disabled by an old
 * ended session: newer sessions reuse the same Cloudflare Live Input.
 */
export async function retryRtmpLiveInputDisableCandidates(
  candidates: PendingRtmpLiveInputDisable[],
  persistentInputIds: ReadonlySet<string>,
  activeInputIds: ReadonlySet<string>,
  disable: (inputId: string) => Promise<{ disabledAt: string | null; error: string | null }>,
  persist: (sessionId: string, result: { disabledAt: string | null; error: string | null }) => Promise<void>,
  markSkipped: (sessionId: string) => Promise<void> = async () => undefined,
): Promise<{ attempted: number; disabled: number; failed: number; skippedInUse: number }> {
  let attempted = 0;
  let disabled = 0;
  let failed = 0;
  let skippedInUse = 0;

  for (const session of candidates) {
    if (session.is_persistent_stream
      || persistentInputIds.has(session.cloudflare_live_input_id)
      || activeInputIds.has(session.cloudflare_live_input_id)) {
      skippedInUse++;
      await markSkipped(session.id);
      continue;
    }

    attempted++;
    const result = await disable(session.cloudflare_live_input_id);
    await persist(session.id, result);
    if (result.disabledAt) disabled++;
    else failed++;
  }

  return { attempted, disabled, failed, skippedInUse };
}

export async function commitFencedRtmpEnd(
  admin: any,
  args: {
    sessionId: string;
    claimToken: string;
    sessionPatch: Record<string, unknown>;
    postId: string | null;
    postPatch: Record<string, unknown> | null;
    replayPatch: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const { data, error } = await admin.rpc('finalize_rtmp_live_session_end', {
    p_live_session_id: args.sessionId,
    p_claim_token: args.claimToken,
    p_session_patch: args.sessionPatch,
    p_post_id: args.postId,
    p_post_patch: args.postPatch,
    p_replay_patch: args.replayPatch,
  });
  if (error) throw error;
  return data === true;
}

/**
 * The database function locks the session row and checks the claim token in the
 * same transaction as post/replay/session writes. A stale worker therefore
 * cannot commit any of those writes after a replacement claim wins.
 */
export async function finalizeClaimedRtmpEnd<T>(
  finalize: () => Promise<{ committed: boolean; value: T }>,
  readLostClaimResult: () => Promise<T>,
): Promise<T> {
  const result = await finalize();
  return result.committed ? result.value : readLostClaimResult();
}

/**
 * Claim an RTMP end transition before any provider or post side effect. `ending`
 * is an existing live_sessions status and `updated_at` provides a bounded lease
 * for recovering a worker that died while holding the claim.
 */
export async function claimRtmpEndSession(
  admin: any,
  sessionId: string,
  claimToken: string,
  reason: string,
  now: string,
  staleClaimBefore: string,
  lifecyclePatch: Record<string, unknown> = {},
): Promise<any | null> {
  const activeClaim = await admin
    .from('live_sessions')
    .update({ ...lifecyclePatch, status: 'ending', end_reason: reason, end_claim_token: claimToken, updated_at: now })
    .eq('id', sessionId)
    .is('ended_at', null)
    .in('status', [...RTMP_END_CLAIMABLE_STATUSES])
    .select('*')
    .maybeSingle();
  if (activeClaim.error) throw activeClaim.error;
  if (activeClaim.data) return activeClaim.data;

  const staleClaim = await admin
    .from('live_sessions')
    .update({ status: 'ending', end_claim_token: claimToken, updated_at: now })
    .eq('id', sessionId)
    .eq('status', 'ending')
    .is('ended_at', null)
    .lt('updated_at', staleClaimBefore)
    .select('*')
    .maybeSingle();
  if (staleClaim.error) throw staleClaim.error;
  return staleClaim.data || null;
}

export async function readRtmpEndSession(admin: any, sessionId: string): Promise<any | null> {
  const { data, error } = await admin
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function runClaimedRtmpEndTransition<T, R>(
  transition: ClaimedRtmpEndTransition<T, R>,
): Promise<R> {
  const claimedRow = await transition.claim();
  if (claimedRow) return transition.runSideEffects(claimedRow);

  const currentRow = await transition.readCurrent();
  return transition.makeIdempotentResult(currentRow);
}
