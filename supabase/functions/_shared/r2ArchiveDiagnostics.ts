/** Safe, credential-free diagnostics for public R2 playback verification. */
export function describeR2PlayableFailure(status: number, error?: unknown): string {
  if (status > 0) return `R2 public URL returned HTTP ${status}`;

  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/dns|resolve|ENOTFOUND|EAI_AGAIN|NXDOMAIN/i.test(message)) {
    return 'R2 public URL DNS lookup failed';
  }
  if (/tls|ssl|certificate|cert error|handshake/i.test(message)) {
    return 'R2 public URL TLS connection failed';
  }
  if (/invalid url|failed to parse url|unsupported url/i.test(message)) {
    return 'R2 public URL configuration is invalid';
  }
  return 'R2 public URL network request failed';
}

export function isSafeR2PublicBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !!url.hostname
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function canReuseConfirmedR2Object(
  exists: boolean,
  objectSize: number,
  expectedSize: number,
): boolean {
  return exists && objectSize > 0 && (expectedSize <= 0 || objectSize >= expectedSize);
}

export function mayPublishR2Replay(publicUrlVerified: boolean): boolean {
  return publicUrlVerified;
}
