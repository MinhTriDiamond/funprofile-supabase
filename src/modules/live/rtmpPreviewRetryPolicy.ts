const PREVIEW_RETRY_DELAYS_MS = [2000, 4000, 6000] as const;

export function getRtmpPreviewRetryDelay(retryCount: number): number | null {
  return PREVIEW_RETRY_DELAYS_MS[retryCount] ?? null;
}
