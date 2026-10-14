export class CloudflareApiError extends Error {
  readonly upstreamStatus: number;
  readonly upstreamCodes: number[];

  constructor(operation: string, upstreamStatus: number, upstreamCodes: number[] = []) {
    super(`Cloudflare Stream ${operation} failed (HTTP ${upstreamStatus})`);
    this.name = 'CloudflareApiError';
    this.upstreamStatus = upstreamStatus;
    this.upstreamCodes = upstreamCodes;
  }
}

export function getCloudflareErrorCodes(data: unknown): number[] {
  if (!data || typeof data !== 'object') return [];
  const errors = (data as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .map((error) => error && typeof error === 'object' ? (error as { code?: unknown }).code : null)
    .filter((code): code is number => typeof code === 'number' && Number.isInteger(code));
}
