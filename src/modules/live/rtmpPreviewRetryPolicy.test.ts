import { describe, expect, it } from 'vitest';
import { getRtmpPreviewRetryDelay } from './rtmpPreviewRetryPolicy';

describe('getRtmpPreviewRetryDelay', () => {
  it('waits for Cloudflare to make the stream playable, then keeps retrying periodically', () => {
    expect(getRtmpPreviewRetryDelay(0)).toBe(45000);
    expect(getRtmpPreviewRetryDelay(1)).toBe(30000);
    expect(getRtmpPreviewRetryDelay(2)).toBe(30000);
    expect(getRtmpPreviewRetryDelay(10)).toBe(30000);
  });
});
