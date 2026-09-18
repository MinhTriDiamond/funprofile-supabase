export function buildAgoraChannelName(userId: string, now = Date.now()): string {
  return `live_${userId}_${now}`;
}

export function uuidToAgoraNumericUid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash) + uuid.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 10001;
}
