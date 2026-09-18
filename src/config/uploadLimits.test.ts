import { describe, expect, it } from 'vitest';
import {
  IMAGE_LIMITS,
  MEDIA_LIMIT_MESSAGES,
  MEDIA_LIMITS,
  validateImageFile,
  validatePostMediaCounts,
  validateVideoFile,
  VIDEO_LIMITS,
} from './uploadLimits';

const MB = 1024 * 1024;

function fileLike(name: string, type: string, size: number) {
  return { name, type, size } as File;
}

describe('upload media limits', () => {
  it('blocks 31 images', () => {
    expect(validatePostMediaCounts({ images: 31, videos: 0 })).toMatchObject({
      code: 'MEDIA_LIMIT_EXCEEDED',
      message: MEDIA_LIMIT_MESSAGES.maxTotal,
    });
  });

  it('blocks 11 videos', () => {
    expect(validatePostMediaCounts({ images: 0, videos: 11 })).toMatchObject({
      code: 'VIDEO_LIMIT_EXCEEDED',
    });
  });

  it('blocks 31 total media', () => {
    expect(validatePostMediaCounts({ images: 21, videos: 10 })).toMatchObject({
      code: 'MEDIA_LIMIT_EXCEEDED',
    });
  });

  it('allows supported images up to 20MB and blocks larger images', () => {
    expect(validateImageFile(fileLike('ok.jpg', 'image/jpeg', IMAGE_LIMITS.MAX_BYTES))).toBeNull();
    expect(validateImageFile(fileLike('too-large.webp', 'image/webp', IMAGE_LIMITS.MAX_BYTES + 1))).toMatchObject({
      code: 'IMAGE_TOO_LARGE',
    });
  });

  it('blocks normal user videos over 2GB', () => {
    expect(validateVideoFile(fileLike('big.mp4', 'video/mp4', VIDEO_LIMITS.MAX_BYTES_USER + 1))).toMatchObject({
      code: 'VIDEO_TOO_LARGE',
    });
  });

  it('allows elevated account videos up to 10GB', () => {
    expect(validateVideoFile(
      fileLike('premium.mov', 'video/quicktime', MEDIA_LIMITS.maxVideoSizeMBPremium * MB),
      { isElevatedMediaAccount: true },
    )).toBeNull();
  });

  it('blocks videos over 4 hours', () => {
    expect(validateVideoFile(
      fileLike('long.webm', 'video/webm', 100 * MB),
      { durationSeconds: VIDEO_LIMITS.MAX_DURATION_SECONDS + 1 },
    )).toMatchObject({ code: 'VIDEO_DURATION_TOO_LONG' });
  });

  it('blocks unsupported media types', () => {
    expect(validateImageFile(fileLike('photo.gif', 'image/gif', 1 * MB))).toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
    expect(validateVideoFile(fileLike('clip.m4v', 'video/x-m4v', 1 * MB))).toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
  });
});
