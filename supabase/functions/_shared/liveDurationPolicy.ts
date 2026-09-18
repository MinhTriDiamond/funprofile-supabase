export const WEBCAM_LIVE_MAX_DURATION_MINUTES = 120;
export const RTMP_LIVE_MAX_DURATION_MINUTES = 240;
export const LIVE_WARNING_MINUTES = [30, 10, 5, 1] as const;

export type LiveDurationMode = 'agora_webcam' | 'rtmp_obs';

export function getLiveMaxDurationMinutes(mode: string | null | undefined): number {
  return mode === 'rtmp_obs' ? RTMP_LIVE_MAX_DURATION_MINUTES : WEBCAM_LIVE_MAX_DURATION_MINUTES;
}

export function getLiveMaxDurationMs(mode: string | null | undefined): number {
  return getLiveMaxDurationMinutes(mode) * 60 * 1000;
}

export function getLiveDurationDeadline(startedAt: string | null | undefined, mode: string | null | undefined): Date | null {
  if (!startedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedMs)) return null;
  return new Date(startedMs + getLiveMaxDurationMs(mode));
}

export function isLiveDurationExpired(
  startedAt: string | null | undefined,
  mode: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const deadline = getLiveDurationDeadline(startedAt, mode);
  return !!deadline && nowMs >= deadline.getTime();
}
