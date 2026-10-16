import { describe, expect, it } from 'vitest';
import { sanitizeLivePostDebugPayload } from './livePostDebug';

describe('sanitizeLivePostDebugPayload', () => {
  it('omits media URLs and sensitive fields from debug output', () => {
    const result = sanitizeLivePostDebugPayload({
      hls_url: 'https://media.example/live.m3u8?token=private',
      authorization: 'Bearer private',
      status: 'live',
      content: 'private post text',
    });

    expect(result).toEqual({ status: 'live' });
  });

  it('redacts URLs embedded in diagnostic strings', () => {
    const result = sanitizeLivePostDebugPayload({
      message: 'playback failed at https://media.example/video.mp4?sig=private',
      attempt: 2,
    });

    expect(result).toEqual({ message: 'playback failed at [redacted-url]', attempt: 2 });
    expect(JSON.stringify(result)).not.toContain('sig=private');
  });
});
