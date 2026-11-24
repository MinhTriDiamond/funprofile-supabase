import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { calculateFileHash } from './mediaUpload';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const MB = 1024 * 1024;

describe('bounded full-content upload hash', () => {
  it('matches the existing SHA256 resume ID across chunk boundaries without reading the whole file', async () => {
    const bytes = new Uint8Array(17 * MB + 13);
    bytes[0] = 1; bytes[8 * MB + 7] = 42; bytes[bytes.length - 1] = 99;
    const blob = new Blob([bytes]);
    const wholeRead = vi.fn(() => { throw new Error('whole-file allocation forbidden'); });
    const slice = vi.fn((start: number, end: number) => {
      expect(end - start).toBeLessThanOrEqual(8 * MB);
      return blob.slice(start, end);
    });
    const file = { size: blob.size, arrayBuffer: wholeRead, slice } as unknown as File;
    expect(await calculateFileHash(file)).toBe(createHash('sha256').update(bytes).digest('hex').slice(0, 16));
    expect(wholeRead).not.toHaveBeenCalled();
    expect(slice).toHaveBeenCalledTimes(3);
  });

  it('hashes empty files consistently', async () => {
    expect(await calculateFileHash(new Blob([]) as File)).toBe(createHash('sha256').digest('hex').slice(0, 16));
  });
});
