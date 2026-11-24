import { describe, expect, it } from 'vitest';
import { getUploadErrorMessage, UploadRequestError } from './uploadError';

describe('upload errors visible to the composer', () => {
  const fallback = 'Không thể tải video.';
  it('distinguishes a rejected size limit from a failed connection', () => {
    expect(getUploadErrorMessage(new UploadRequestError(400, 'VIDEO_TOO_LARGE'), fallback)).toContain('10 GB');
    expect(getUploadErrorMessage(new TypeError('Failed to fetch'), fallback)).toContain('kết nối');
  });
  it('explains expired login and unavailable local files', () => {
    expect(getUploadErrorMessage(new UploadRequestError(401), fallback)).toContain('đăng nhập');
    expect(getUploadErrorMessage(new DOMException('private path', 'NotReadableError'), fallback)).toContain('chọn lại');
  });
  it('keeps unknown server responses and signed URLs out of the message', () => {
    expect(getUploadErrorMessage(new Error('secret signed URL'), fallback)).toBe(fallback);
    expect(getUploadErrorMessage(new UploadRequestError(500, '<untrusted>'), fallback)).toBe(fallback);
  });
});
