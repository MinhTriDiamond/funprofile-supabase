import { describe, expect, it } from 'vitest';
import { sanitizeProfileSearch } from './chatSearch';

describe('profile search filter sanitization', () => {
  it('preserves Vietnamese names while removing PostgREST filter syntax', () => {
    expect(sanitizeProfileSearch('Nguyễn, An)(or.id.eq.*')).toBe('Nguyễn  An  or.id.eq.');
  });
  it('limits the search expression length', () => {
    expect(sanitizeProfileSearch('a'.repeat(200))).toHaveLength(64);
  });
});
