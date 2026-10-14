import { describe, expect, it } from 'vitest';
import { CloudflareApiError, getCloudflareErrorCodes } from '../../../supabase/functions/_shared/cloudflareApiError';

describe('Cloudflare API errors', () => {
  it('keeps upstream status and numeric provider codes without retaining the raw response', () => {
    const codes = getCloudflareErrorCodes({
      errors: [{ code: 10000, message: 'Authentication error', Authorization: 'Bearer do-not-retain' }],
    });
    const error = new CloudflareApiError('Live Input create', 403, codes);

    expect(error).toMatchObject({ name: 'CloudflareApiError', upstreamStatus: 403, upstreamCodes: [10000] });
    expect(error.message).toContain('HTTP 403');
    expect(error.message).not.toContain('Authentication error');
    expect(error.message).not.toContain('do-not-retain');
  });

  it('ignores non-numeric provider codes and malformed error payloads', () => {
    expect(getCloudflareErrorCodes({ errors: [{ code: '10000' }, null, { message: 'no code' }] })).toEqual([]);
    expect(getCloudflareErrorCodes('not-an-object')).toEqual([]);
  });
});
