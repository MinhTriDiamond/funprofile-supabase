const INITIAL_PREVIEW_RETRY_DELAY_MS = 45_000;
const PREVIEW_RETRY_INTERVAL_MS = 30_000;

export function getRtmpPreviewRetryDelay(retryCount: number): number {
  return retryCount <= 0 ? INITIAL_PREVIEW_RETRY_DELAY_MS : PREVIEW_RETRY_INTERVAL_MS;
}
