import { MEDIA_LIMIT_MESSAGES } from '@/config/uploadLimits';

/** Carry only status/code, never signed URLs or raw server responses into the UI. */
export class UploadRequestError extends Error {
  constructor(public readonly status: number, public readonly code?: string) {
    super(`Upload request failed (${status})`);
    this.name = 'UploadRequestError';
  }
}

export function getUploadErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof UploadRequestError) {
    if (error.code === 'VIDEO_TOO_LARGE') return MEDIA_LIMIT_MESSAGES.videoTooLarge;
    if (error.code === 'VIDEO_DURATION_TOO_LONG') return MEDIA_LIMIT_MESSAGES.videoTooLong;
    if (error.code === 'UNSUPPORTED_MEDIA_TYPE') return MEDIA_LIMIT_MESSAGES.unsupportedType;
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử tải video.';
  }
  if (error instanceof Error) {
    if (error.name === 'NotReadableError' || error.name === 'NotFoundError') {
      return 'Không đọc được tệp video. Vui lòng chọn lại tệp từ thiết bị rồi thử lại.';
    }
    if (error.message === 'Chưa đăng nhập') return 'Vui lòng đăng nhập lại rồi thử tải video.';
    if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
      return 'Không kết nối được máy chủ tải video. Vui lòng kiểm tra kết nối rồi thử lại.';
    }
  }
  return fallback;
}
