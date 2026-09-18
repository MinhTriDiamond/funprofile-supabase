import type { PostMetadata } from './types';
import { getPostPlayback } from './postPlaybackResolver';

type UnknownPost = Record<string, unknown>;

export interface LivePostVideoSource {
  url: string | null;
  source: string | null;
  isArchive: boolean;
}

/**
 * @deprecated Use getPostPlayback(post). This wrapper keeps legacy imports on
 * the same normalized playback contract.
 */
export function resolveLivePostVideoSource(
  post: UnknownPost,
  metadata?: PostMetadata | null,
): LivePostVideoSource {
  const playback = getPostPlayback({ ...post, metadata }, { metadata });
  return {
    url: playback.status === 'ready' ? playback.url : null,
    source: playback.sourceField,
    isArchive: playback.status === 'ready' && playback.type === 'live_replay',
  };
}
