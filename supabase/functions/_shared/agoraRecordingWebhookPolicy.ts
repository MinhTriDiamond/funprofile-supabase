export interface AgoraRecordingNotification {
  eventKey: string;
  noticeId: string;
  productId: 3;
  eventType: number;
  notifyMs: number | null;
  recordingSid: string;
  sequence: number;
  channelName: string;
  uid: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function equalConstantTime(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function hmacHex(rawBody: string, secret: string, hash: 'SHA-1' | 'SHA-256'): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyAgoraRecordingSignature(
  rawBody: string,
  headers: { signature?: string | null; signatureV2?: string | null },
  secret: string,
): Promise<boolean> {
  if (!secret) return false;
  try {
    const checks: Promise<boolean>[] = [];
    if (headers.signature) {
      checks.push(hmacHex(rawBody, secret, 'SHA-1').then((expected) => equalConstantTime(expected, headers.signature!.toLowerCase())));
    }
    if (headers.signatureV2) {
      checks.push(hmacHex(rawBody, secret, 'SHA-256').then((expected) => equalConstantTime(expected, headers.signatureV2!.toLowerCase())));
    }
    if (!checks.length) return false;
    const results = await Promise.all(checks);
    return results.some(Boolean);
  } catch {
    return false;
  }
}

export function parseAgoraRecordingNotification(value: unknown): AgoraRecordingNotification | null {
  if (!isRecord(value) || value.productId !== 3 || !isRecord(value.payload)) return null;
  const payload = value.payload;
  const noticeId = typeof value.noticeId === 'string' ? value.noticeId.trim() : '';
  const recordingSid = typeof payload.sid === 'string' ? payload.sid.trim() : '';
  const channelName = typeof payload.cname === 'string' ? payload.cname.trim() : '';
  const sequence = Number(payload.sequence);
  const eventType = Number(value.eventType);
  if (!noticeId || !recordingSid || !channelName || !Number.isSafeInteger(sequence) || sequence < 0 || !Number.isInteger(eventType)) {
    return null;
  }

  const uid = typeof payload.uid === 'string' || typeof payload.uid === 'number' ? String(payload.uid) : null;
  const notifyMs = Number.isFinite(Number(value.notifyMs)) ? Number(value.notifyMs) : null;
  return {
    // sequence is stable for a given recorded event while noticeId may be useful for audit.
    eventKey: `${recordingSid}:${sequence}`,
    noticeId,
    productId: 3,
    eventType,
    notifyMs,
    recordingSid,
    sequence,
    channelName,
    uid,
  };
}

export function shouldWakeRecordingProcessor(eventType: number): boolean {
  // These are terminal/flush-related signals. Event 4 only reports the first
  // playlist upload while recording continues, so it must not trigger work.
  return eventType === 11 || eventType === 31;
}

export function isDuplicateAgoraRecordingReceipt(errorCode: string | null | undefined): boolean {
  return errorCode === '23505';
}

export function classifyAgoraRecordingSessionLookup(
  hasError: boolean,
  sessionId: string | null | undefined,
): 'retry' | 'unmatched' | 'matched' {
  if (hasError) return 'retry';
  return sessionId ? 'matched' : 'unmatched';
}

export function isPendingAgoraRecording(session: Record<string, unknown>): boolean {
  const recordingStatuses = new Set(['stopped', 'ready', 'failed', 'recording', 'processing']);
  const archiveStatuses = new Set(['pending', 'failed', 'archiving']);
  return session.mode === 'agora_webcam'
    && typeof session.recording_sid === 'string'
    && session.recording_sid.length > 0
    && recordingStatuses.has(String(session.recording_status || ''))
    && (session.archive_status == null || archiveStatuses.has(String(session.archive_status)));
}
