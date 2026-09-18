import { MediaGrid } from './MediaGrid';
import type { PostData } from './types';
import type { PostPlayback } from './postPlaybackResolver';

interface ReplayPostMediaProps {
  post: PostData;
  playback: PostPlayback;
}

export function ReplayPostMedia({ post, playback }: ReplayPostMediaProps) {
  if (!playback.url) return null;

  const aspectRatio: 'portrait_9_16' | 'landscape_16_9' = post.metadata?.recording_layout === 'portrait_9_16'
    ? 'portrait_9_16'
    : 'landscape_16_9';
  const baseMedia = Array.isArray(post.media_urls) ? post.media_urls : [];
  const mappedMedia = baseMedia.map((item) => ({
    ...item,
    url: item.type === 'video' ? playback.url! : item.url,
    isLiveReplay: item.type === 'video',
    poster: item.type === 'video' ? playback.thumbnailUrl || undefined : undefined,
    aspectRatio: item.type === 'video' ? aspectRatio : undefined,
  }));

  if (!mappedMedia.some((item) => item.type === 'video')) {
    mappedMedia.push({
      url: playback.url,
      type: 'video',
      isLiveReplay: true,
      poster: playback.thumbnailUrl || undefined,
      aspectRatio,
    });
  }

  return <MediaGrid media={mappedMedia} feedId={post.id} />;
}
