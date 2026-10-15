import { describe, expect, it } from 'vitest';
import {
  isDuplicateAgoraRecordingReceipt,
  isPendingAgoraRecording,
  classifyAgoraRecordingSessionLookup,
  parseAgoraRecordingNotification,
  shouldWakeRecordingProcessor,
  verifyAgoraRecordingSignature,
} from '../../../supabase/functions/_shared/agoraRecordingWebhookPolicy';
import { classifyLivestreamOrphan } from '../../../supabase/functions/_shared/livestreamRecoveryPolicy';

async function sign(body: string, secret: string, algorithm: 'SHA-1' | 'SHA-256') {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('Agora Cloud Recording webhook policy', () => {
  it('acknowledges an unmatched session but retries database lookup failures', () => {
    expect(classifyAgoraRecordingSessionLookup(false, null)).toBe('unmatched');
    expect(classifyAgoraRecordingSessionLookup(true, null)).toBe('retry');
    expect(classifyAgoraRecordingSessionLookup(false, 'session-1')).toBe('matched');
  });

  it('accepts valid v1/v2 signatures and rejects a wrong signature', async () => {
    const rawBody = '{"noticeId":"n1","productId":3,"eventType":31,"payload":{"sid":"sid-1","sequence":8,"cname":"channel"}}';
    const secret = 'test-only-secret';
    const v1 = await sign(rawBody, secret, 'SHA-1');
    const v2 = await sign(rawBody, secret, 'SHA-256');

    expect(await verifyAgoraRecordingSignature(rawBody, { signature: v1 }, secret)).toBe(true);
    expect(await verifyAgoraRecordingSignature(rawBody, { signatureV2: v2 }, secret)).toBe(true);
    expect(await verifyAgoraRecordingSignature(rawBody, { signatureV2: '00' }, secret)).toBe(false);
    expect(await verifyAgoraRecordingSignature(rawBody, { signature: v1 }, '')).toBe(false);
  });

  it('derives a stable idempotency key and preserves late event sequence without changing state', () => {
    const event = parseAgoraRecordingNotification({
      noticeId: 'notice-duplicate',
      productId: 3,
      eventType: 31,
      notifyMs: 1000,
      payload: { sid: 'recording-1', sequence: 4, cname: 'channel-1', fileList: [{ fileName: 'replay.mp4' }] },
    });

    expect(event?.eventKey).toBe('recording-1:4');
    expect(parseAgoraRecordingNotification({
      noticeId: 'other-notice-id',
      productId: 3,
      eventType: 31,
      payload: { sid: 'recording-1', sequence: 4, cname: 'channel-1' },
    })?.eventKey).toBe(event?.eventKey);
    expect(isDuplicateAgoraRecordingReceipt('23505')).toBe(true);
    expect(isDuplicateAgoraRecordingReceipt('PGRST116')).toBe(false);
    expect(shouldWakeRecordingProcessor(31)).toBe(true);
    expect(shouldWakeRecordingProcessor(11)).toBe(true);
  });

  it('does not wake processing for early/irrelevant events or malformed payloads', () => {
    expect(shouldWakeRecordingProcessor(4)).toBe(false);
    expect(parseAgoraRecordingNotification({ productId: 1, eventType: 31, payload: {} })).toBeNull();
    expect(parseAgoraRecordingNotification({
      noticeId: 'no-sequence', productId: 3, eventType: 31,
      payload: { sid: 'recording-1', cname: 'channel-1' },
    })).toBeNull();
  });

  it('keeps pending sessions eligible for reconciliation when no callback arrived', () => {
    expect(isPendingAgoraRecording({
      mode: 'agora_webcam',
      status: 'ended',
      recording_status: 'stopped',
      recording_sid: 'recording-1',
      archive_status: 'pending',
      created_at: '2020-01-01T00:00:00Z',
    })).toBe(true);
  });

  it('classifies object candidates as recoverable and does not infer terminal state from age', () => {
    expect(classifyLivestreamOrphan({ providerHandle: true, providerQuery: 'temporary_error', mediaObjectVerified: false }))
      .toBe('retryable');
    expect(classifyLivestreamOrphan({ providerHandle: true, providerQuery: 'terminal', providerQuerySucceeded: true, mediaObjectChecked: true, mediaObjectVerified: false }))
      .toBe('terminal');
    expect(classifyLivestreamOrphan({ providerHandle: false, providerQuery: 'unknown' }))
      .toBe('ambiguous');
    expect(classifyLivestreamOrphan({ providerHandle: false, mediaObjectVerified: true }))
      .toBe('recoverable');
  });
});
