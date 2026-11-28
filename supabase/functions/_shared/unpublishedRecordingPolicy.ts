export interface RecordingArchiveScope {
  tokenHash: string;
  configId: string;
  streamUid: string;
  expiresAt: string;
  maxBytes: number;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function recordingArchiveScope(raw: string | undefined, token: string, now = Date.now()): Promise<RecordingArchiveScope | null> {
  if (!raw || !token || token.length > 256) return null;
  try {
    const s = JSON.parse(raw) as RecordingArchiveScope;
    if (!/^[a-f0-9]{64}$/.test(s.tokenHash) || !uuid.test(s.configId) || !/^[a-f0-9]{32}$/.test(s.streamUid)
      || !Number.isFinite(Date.parse(s.expiresAt)) || Date.parse(s.expiresAt) <= now
      || !Number.isSafeInteger(s.maxBytes) || s.maxBytes < 1024 || s.maxBytes > 20 * 1024 ** 3) return null;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
    let difference = 0; for (let i=0;i<64;i++) difference |= hash.charCodeAt(i)^s.tokenHash.charCodeAt(i);
    return difference === 0 ? s : null;
  } catch { return null; }
}
export function eligibleUnpublishedRecording(video: Record<string, unknown>, uid: string, inputId: string): boolean {
  const status = video.status as {state?: string} | undefined;
  const input = video.liveInput;
  const inputUid = typeof input === 'string' ? input : (input && typeof input === 'object' ? (input as {uid?:string;id?:string}).uid || (input as {id?:string}).id : null);
  const duration = Number(video.duration);
  return video.uid === uid && inputUid === inputId && status?.state === 'ready'
    && video.readyToStream === true && video.live !== true && video.requireSignedURLs === false
    && Number.isFinite(duration) && duration > 0 && duration <= 4 * 60 * 60;
}
export const RECORDING_ARCHIVE_PART_BYTES = 16 * 1024 ** 2;
export function validateRecordingParts(parts: unknown, size: number): boolean {
  if (!Array.isArray(parts) || !Number.isSafeInteger(size) || size < 1 || parts.length !== Math.ceil(size / RECORDING_ARCHIVE_PART_BYTES)) return false;
  return parts.every((p,i)=>p && p.partNumber === i+1 && /^[a-fA-F0-9]{32}$/.test(p.etag)
    && p.size === Math.min(RECORDING_ARCHIVE_PART_BYTES,size-i*RECORDING_ARCHIVE_PART_BYTES));
}
