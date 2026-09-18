const MB = 1024 * 1024;

export const MEDIA_LIMIT_MESSAGES = {
  maxTotal: 'Bạn có thể đăng tối đa 30 file media trong một bài viết.',
  imageTooLarge: 'Ảnh này vượt quá 20MB. Vui lòng chọn ảnh nhẹ hơn.',
  videoTooLarge: 'Video này vượt quá giới hạn dung lượng cho tài khoản của bạn.',
  videoTooLong: 'Video tối đa hiện được hỗ trợ là 4 giờ.',
  unsupportedType: 'Định dạng media này chưa được hỗ trợ.',
} as const;

export const MEDIA_LIMITS = {
  maxTotalMediaPerPost: 30,
  maxImagesPerPost: 30,
  maxVideosPerPost: 10,
  maxImageSizeMB: 20,
  maxVideoSizeMBUser: 2048,
  maxVideoSizeMBPremium: 10240,
  maxVideoDurationMinutes: 240,
  allowedImageExt: ['jpg', 'jpeg', 'png', 'webp'] as const,
  allowedImageMime: ['image/jpeg', 'image/png', 'image/webp'] as const,
  allowedVideoExt: ['mp4', 'mov', 'webm'] as const,
  allowedVideoMime: ['video/mp4', 'video/quicktime', 'video/webm'] as const,
} as const;

export type MediaKind = 'image' | 'video';

export type MediaValidationCode =
  | 'MEDIA_LIMIT_EXCEEDED'
  | 'IMAGE_LIMIT_EXCEEDED'
  | 'VIDEO_LIMIT_EXCEEDED'
  | 'IMAGE_TOO_LARGE'
  | 'VIDEO_TOO_LARGE'
  | 'VIDEO_DURATION_TOO_LONG'
  | 'UNSUPPORTED_MEDIA_TYPE';

export interface MediaValidationError {
  code: MediaValidationCode;
  message: string;
}

export const IMAGE_LIMITS = {
  MAX_BYTES: MEDIA_LIMITS.maxImageSizeMB * MB,
  ALLOWED_MIME: MEDIA_LIMITS.allowedImageMime,
  ALLOWED_EXT: MEDIA_LIMITS.allowedImageExt,
} as const;

export const VIDEO_LIMITS = {
  MAX_BYTES: MEDIA_LIMITS.maxVideoSizeMBPremium * MB,
  MAX_BYTES_USER: MEDIA_LIMITS.maxVideoSizeMBUser * MB,
  MAX_BYTES_PREMIUM: MEDIA_LIMITS.maxVideoSizeMBPremium * MB,
  MAX_DURATION_SECONDS: MEDIA_LIMITS.maxVideoDurationMinutes * 60,
  ALLOWED_MIME: MEDIA_LIMITS.allowedVideoMime,
  ALLOWED_EXT: MEDIA_LIMITS.allowedVideoExt,
  MULTIPART_THRESHOLD: 25 * MB,
  MULTIPART_CHUNK_BYTES: 50 * MB,
  MULTIPART_PARALLEL: 4,
  MULTIPART_RETRY_PER_PART: 5,
  RESUME_SESSION_TTL_HOURS: 24,
  MAX_CONCURRENT_PENDING_PER_USER: 3,
} as const;

function getExtension(nameOrKey = ''): string {
  const clean = nameOrKey.split('?')[0].split('#')[0];
  return clean.includes('.') ? clean.split('.').pop()!.toLowerCase() : '';
}

function includesReadonly<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

export function getMaxVideoBytes(isElevatedMediaAccount = false): number {
  return isElevatedMediaAccount ? VIDEO_LIMITS.MAX_BYTES_PREMIUM : VIDEO_LIMITS.MAX_BYTES_USER;
}

export function detectMediaKind(file: Pick<File, 'name' | 'type'>): MediaKind | null {
  const ext = getExtension(file.name);
  if (includesReadonly(MEDIA_LIMITS.allowedImageMime, file.type) || includesReadonly(MEDIA_LIMITS.allowedImageExt, ext)) {
    return 'image';
  }
  if (includesReadonly(MEDIA_LIMITS.allowedVideoMime, file.type) || includesReadonly(MEDIA_LIMITS.allowedVideoExt, ext)) {
    return 'video';
  }
  return null;
}

export function validateMediaType(file: Pick<File, 'name' | 'type'>, expectedKind?: MediaKind): MediaValidationError | null {
  const ext = getExtension(file.name);
  if (expectedKind === 'image') {
    return (includesReadonly(MEDIA_LIMITS.allowedImageMime, file.type) || !file.type) && includesReadonly(MEDIA_LIMITS.allowedImageExt, ext)
      ? null
      : { code: 'UNSUPPORTED_MEDIA_TYPE', message: MEDIA_LIMIT_MESSAGES.unsupportedType };
  }
  if (expectedKind === 'video') {
    return (includesReadonly(MEDIA_LIMITS.allowedVideoMime, file.type) || !file.type) && includesReadonly(MEDIA_LIMITS.allowedVideoExt, ext)
      ? null
      : { code: 'UNSUPPORTED_MEDIA_TYPE', message: MEDIA_LIMIT_MESSAGES.unsupportedType };
  }
  return detectMediaKind(file) ? null : { code: 'UNSUPPORTED_MEDIA_TYPE', message: MEDIA_LIMIT_MESSAGES.unsupportedType };
}

export function validateImageFile(file: Pick<File, 'name' | 'type' | 'size'>): MediaValidationError | null {
  return validateMediaType(file, 'image') || (
    file.size > IMAGE_LIMITS.MAX_BYTES
      ? { code: 'IMAGE_TOO_LARGE', message: MEDIA_LIMIT_MESSAGES.imageTooLarge }
      : null
  );
}

export function validateVideoFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  options: { durationSeconds?: number | null; isElevatedMediaAccount?: boolean } = {},
): MediaValidationError | null {
  const typeError = validateMediaType(file, 'video');
  if (typeError) return typeError;
  if (file.size > getMaxVideoBytes(options.isElevatedMediaAccount)) {
    return { code: 'VIDEO_TOO_LARGE', message: MEDIA_LIMIT_MESSAGES.videoTooLarge };
  }
  if (
    typeof options.durationSeconds === 'number'
    && Number.isFinite(options.durationSeconds)
    && options.durationSeconds > VIDEO_LIMITS.MAX_DURATION_SECONDS
  ) {
    return { code: 'VIDEO_DURATION_TOO_LONG', message: MEDIA_LIMIT_MESSAGES.videoTooLong };
  }
  return null;
}

export function validatePostMediaCounts(counts: { images: number; videos: number }): MediaValidationError | null {
  const total = counts.images + counts.videos;
  if (total > MEDIA_LIMITS.maxTotalMediaPerPost) {
    return { code: 'MEDIA_LIMIT_EXCEEDED', message: MEDIA_LIMIT_MESSAGES.maxTotal };
  }
  if (counts.images > MEDIA_LIMITS.maxImagesPerPost) {
    return { code: 'IMAGE_LIMIT_EXCEEDED', message: MEDIA_LIMIT_MESSAGES.maxTotal };
  }
  if (counts.videos > MEDIA_LIMITS.maxVideosPerPost) {
    return { code: 'VIDEO_LIMIT_EXCEEDED', message: MEDIA_LIMIT_MESSAGES.maxTotal };
  }
  return null;
}
