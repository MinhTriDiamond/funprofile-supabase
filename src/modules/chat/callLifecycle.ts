export interface CallAttempt { sessionId: string; generation: number }
export interface CallCleanupDependencies {
  closeTracks: () => void | Promise<void>;
  leaveRtc: (sessionId: string) => void | Promise<void>;
  clearTimers: () => void;
  markEnded?: (sessionId: string) => unknown | Promise<unknown>;
}

export function isCurrentCallAttempt(current: CallAttempt | null, eventAttempt: CallAttempt): boolean {
  return Boolean(current && current.sessionId === eventAttempt.sessionId && current.generation === eventAttempt.generation);
}

export async function cleanupCallAttempt(attempt: CallAttempt, deps: CallCleanupDependencies): Promise<boolean> {
  deps.clearTimers();
  await Promise.allSettled([Promise.resolve().then(deps.closeTracks), Promise.resolve().then(() => deps.leaveRtc(attempt.sessionId))]);
  if (!deps.markEnded) return true;
  try { return (await deps.markEnded(attempt.sessionId)) !== false; }
  catch { return false; }
}

export function mayTransitionToConnected(status: string, current: CallAttempt | null, eventAttempt: CallAttempt): boolean {
  return isCurrentCallAttempt(current, eventAttempt) && status === 'active';
}

export function mayMarkMissed(status: string, current: CallAttempt | null, eventAttempt: CallAttempt): boolean {
  return isCurrentCallAttempt(current, eventAttempt) && status === 'ringing';
}

export function canBeginCall(state: string, transitionInProgress: boolean): boolean {
  return state === 'idle' && !transitionInProgress;
}

export function isRecentRingingCall(status: string, createdAt: string, nowMs: number, timeoutMs: number): boolean {
  if (status !== 'ringing') return false;
  const createdMs = Date.parse(createdAt);
  return Number.isFinite(createdMs) && nowMs - createdMs >= 0 && nowMs - createdMs < timeoutMs;
}
