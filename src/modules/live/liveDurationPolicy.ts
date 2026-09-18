export const WEBCAM_LIVE_MAX_DURATION_MINUTES = 120;
export const RTMP_LIVE_MAX_DURATION_MINUTES = 240;
export const LIVE_WARNING_MINUTES = [30, 10, 5, 1] as const;

export type LiveDurationMode = 'agora_webcam' | 'rtmp_obs';

export function getLiveMaxDurationMinutes(mode: string | null | undefined): number {
  return mode === 'rtmp_obs' ? RTMP_LIVE_MAX_DURATION_MINUTES : WEBCAM_LIVE_MAX_DURATION_MINUTES;
}

export function getLiveMaxDurationSeconds(mode: string | null | undefined): number {
  return getLiveMaxDurationMinutes(mode) * 60;
}

export function formatLiveDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export function getLiveWarningLevel(remainingSeconds: number | null): 'normal' | 'warning' | 'urgent' | 'ended' {
  if (remainingSeconds == null) return 'normal';
  if (remainingSeconds <= 0) return 'ended';
  if (remainingSeconds <= 5 * 60) return 'urgent';
  if (remainingSeconds <= 10 * 60) return 'warning';
  return 'normal';
}

export function getLiveWarningMilestone(
  remainingSeconds: number | null,
  warnedMinutes: ReadonlySet<number>,
): number | null {
  if (remainingSeconds == null || remainingSeconds <= 0) return null;
  const remainingMinutes = Math.ceil(remainingSeconds / 60);
  return LIVE_WARNING_MINUTES.find((minutes) => remainingMinutes === minutes && !warnedMinutes.has(minutes)) ?? null;
}
