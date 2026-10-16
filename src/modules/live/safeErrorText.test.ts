import { describe, expect, it } from 'vitest';
import { safeErrorText } from '../../../supabase/functions/_shared/safeErrorText';

describe('safeErrorText', () => {
  it('redacts URLs and credential-like values from provider errors', () => {
    const result = safeErrorText(new Error('fetch https://r2.example/file?X-Signature=abc failed token=xyz Authorization: Bearer abc123'));

    expect(result).toBe('fetch [redacted-url] failed token=[redacted] Authorization: [redacted]');
    expect(result).not.toContain('X-Signature');
    expect(result).not.toContain('xyz');
    expect(result).not.toContain('abc123');
  });

  it('bounds diagnostic text length', () => {
    expect(safeErrorText('x'.repeat(50), 12)).toHaveLength(12);
  });
});
