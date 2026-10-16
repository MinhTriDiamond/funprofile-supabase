import { describe, expect, it } from 'vitest';
import { getRtmpPreviewRetryDelay } from './rtmpPreviewRetryPolicy';

describe('getRtmpPreviewRetryDelay', () => {
  it('uses increasing delays and stops after three automatic retries', () => {
    expect(getRtmpPreviewRetryDelay(0)).toBe(2000);
    expect(getRtmpPreviewRetryDelay(1)).toBe(4000);
    expect(getRtmpPreviewRetryDelay(2)).toBe(6000);
    expect(getRtmpPreviewRetryDelay(3)).toBeNull();
  });
});
