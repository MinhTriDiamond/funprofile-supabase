import { describe, expect, it, vi } from 'vitest';
import {
  canReuseConfirmedR2Object,
  describeR2PlayableFailure,
  isSafeR2PublicBaseUrl,
  mayPublishR2Replay,
} from '../../../supabase/functions/_shared/r2ArchiveDiagnostics.ts';
import { verifyR2PlayableUrl } from '../../../supabase/functions/_shared/r2StorageService.ts';

describe('R2 replay archive diagnostics and retry policy', () => {
  it('distinguishes a real HTTP response from a fetch failure', () => {
    expect(describeR2PlayableFailure(404)).toBe('R2 public URL returned HTTP 404');
    expect(describeR2PlayableFailure(0, new Error('DNS lookup failed for private.example')))
      .toBe('R2 public URL DNS lookup failed');
    expect(describeR2PlayableFailure(0, new Error('TLS certificate handshake failed')))
      .toBe('R2 public URL TLS connection failed');
    expect(describeR2PlayableFailure(0, new TypeError('fetch failed')))
      .toBe('R2 public URL network request failed');
  });

  it('returns a safe network diagnostic when the public fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new TypeError('request https://media.example/file?signature=secret failed'),
    ));
    try {
      const result = await verifyR2PlayableUrl('https://media.example/file?signature=secret');
      expect(result).toMatchObject({
        ok: false,
        status: 0,
        error: 'R2 public URL network request failed',
      });
      expect(result.error).not.toContain('media.example');
      expect(result.error).not.toContain('secret');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never copies URL, credential, or raw network exception into the diagnostic', () => {
    const error = new Error('fetch https://user:secret@private.example/file?signature=secret failed');
    const diagnostic = describeR2PlayableFailure(0, error);
    expect(diagnostic).not.toContain('private.example');
    expect(diagnostic).not.toContain('secret');
  });

  it('rejects unsafe public domain configuration without exposing its value', () => {
    expect(isSafeR2PublicBaseUrl('https://media.example')).toBe(true);
    expect(isSafeR2PublicBaseUrl('http://media.example')).toBe(false);
    expect(isSafeR2PublicBaseUrl('https://user:secret@media.example')).toBe(false);
    expect(isSafeR2PublicBaseUrl('https://media.example/?signature=secret')).toBe(false);
  });

  it('reuses only a signed-HEAD-confirmed complete object on retry', () => {
    expect(canReuseConfirmedR2Object(true, 1000, 1000)).toBe(true);
    expect(canReuseConfirmedR2Object(true, 1000, 900)).toBe(true);
    expect(canReuseConfirmedR2Object(true, 899, 900)).toBe(false);
    expect(canReuseConfirmedR2Object(false, 1000, 900)).toBe(false);
  });

  it('keeps an existing replay processing until the public URL is verified', () => {
    expect(mayPublishR2Replay(false)).toBe(false);
    expect(mayPublishR2Replay(true)).toBe(true);
  });
});
