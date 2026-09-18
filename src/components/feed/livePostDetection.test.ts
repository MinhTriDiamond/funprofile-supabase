import { describe, expect, it } from 'vitest';
import { isLiveLikePost, isLiveStatusText, normalizeLiveText } from './livePostDetection';

describe('livePostDetection', () => {
  it('normalizes Vietnamese live status text with real Unicode d-stroke', () => {
    expect(normalizeLiveText('\u0110ang LIVE tr\u00ean FUN Profile')).toBe('dang live tren fun profile');
    expect(normalizeLiveText('\u0111ang live tr\u00ean fun profile')).toBe('dang live tren fun profile');
  });

  it('detects common live status text variants', () => {
    expect(isLiveStatusText('\u0110ang LIVE tr\u00ean FUN Profile')).toBe(true);
    expect(isLiveStatusText('Dang LIVE tren FUN Profile')).toBe(true);
    expect(isLiveStatusText('\u0111ang live tr\u00ean fun profile')).toBe(true);
  });

  it('treats text-only live status posts as live-like', () => {
    expect(isLiveLikePost({
      id: 'post-1',
      post_type: 'text',
      content: '\u0110ang LIVE tr\u00ean FUN Profile',
    })).toBe(true);
  });
});
