export const LIVE_MP4_LIMIT_SECONDS = 4 * 60 * 60;

export class StreamLiveMp4Unavailable extends Error {
  readonly code = 'live_mp4_duration_limit';
  constructor(readonly durationSeconds: number) {
    super('Bản ghi live trên 4 giờ vẫn còn trên HLS/DASH; cần phục hồi sang R2 bằng HLS, Cloudflare không hỗ trợ xuất MP4 trực tiếp.');
    this.name = 'StreamLiveMp4Unavailable';
  }
}

// Uploaded videos may also exceed four hours: this restriction only concerns
// recordings produced by a live input, never infer provenance from duration alone.
export function assertStreamLiveMp4Supported(meta: Record<string, unknown>): void {
  const duration = Number(meta.duration);
  if (typeof meta.liveInput === 'string' && meta.liveInput.length > 0
    && Number.isFinite(duration) && duration > LIVE_MP4_LIMIT_SECONDS) {
    throw new StreamLiveMp4Unavailable(duration);
  }
}
