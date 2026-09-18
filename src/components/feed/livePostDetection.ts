export type LiveLikePostInput = Record<string, unknown> & {
  post_type?: string | null;
  content?: string | null;
  metadata?: unknown;
};

export type LiveLikeMetadataInput = Record<string, unknown> | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeLiveText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .replace(/[Ä‘Ä]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLiveStatusText(value: unknown): boolean {
  const text = normalizeLiveText(value);
  return /\bdang\s+live\s+(?:tren\s+)?fun\s+profile\b/.test(text)
    || /\blive\s+(?:tren\s+)?fun\s+profile\b/.test(text);
}

export function isLiveLikePost(post: LiveLikePostInput, metadataOverride?: LiveLikeMetadataInput): boolean {
  const metadata = isRecord(metadataOverride)
    ? metadataOverride
    : isRecord(post.metadata)
      ? post.metadata
      : {};

  return post.post_type === 'live'
    || post.post_type === 'live_replay'
    || hasString(post.live_session_id)
    || hasString(post.replay_status)
    || hasString(post.recording_status)
    || hasString(metadata.live_session_id)
    || hasString(metadata.live_status)
    || hasString(metadata.replay_status)
    || hasString(metadata.recording_status)
    || hasString(metadata.archive_status)
    || isLiveStatusText(post.content);
}
