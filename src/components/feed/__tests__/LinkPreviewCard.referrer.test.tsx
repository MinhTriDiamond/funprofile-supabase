/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { LinkPreviewCard } from '@/components/feed/LinkPreviewCard';
import { useLinkPreview } from '@/hooks/useLinkPreview';

vi.mock('@/hooks/useLinkPreview', () => ({
  useLinkPreview: vi.fn(),
  extractFirstUrl: vi.fn(),
}));

afterEach(cleanup);

function renderPreview(video: string) {
  vi.mocked(useLinkPreview).mockReturnValue({
    data: {
      url: 'https://youtube.com/live/PdNMiq0X2BI',
      video,
      title: 'Video livestream',
      description: null,
      image: null,
      siteName: 'YouTube',
      favicon: null,
      author: null,
    },
    isLoading: false,
  });
  return render(<LinkPreviewCard url="https://youtube.com/live/PdNMiq0X2BI" />);
}

describe('LinkPreviewCard embedded player identity', () => {
  it.each([
    'https://www.youtube.com/embed/PdNMiq0X2BI',
    'https://youtube.com/embed/PdNMiq0X2BI',
    'https://www.youtube-nocookie.com/embed/PdNMiq0X2BI',
    'https://youtube-nocookie.com/embed/PdNMiq0X2BI',
  ])('allows origin-only Referer for YouTube iframe: %s', (video) => {
    const { container } = renderPreview(video);
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe(video);
    expect(iframe?.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(container.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it.each([
    'https://player.vimeo.com/video/123',
    'https://other.example/youtube.com/embed/PdNMiq0X2BI',
    'invalid:youtube.com/embed/PdNMiq0X2BI',
  ])('keeps referrer suppressed for other embed destinations: %s', (video) => {
    const { container } = renderPreview(video);
    expect(container.querySelector('iframe')?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });
});
