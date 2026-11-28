export interface RecoveryScope {
  tokenHash: string;
  replayId: string;
  streamUid: string;
  expiresAt: string;
  maxBytes: number;
}
export async function validateRecoveryCapability(raw: string | undefined, token: string, now = Date.now()): Promise<RecoveryScope | null> {
  if (!raw || !token || token.length > 256) return null;
  try {
    const scope = JSON.parse(raw) as RecoveryScope;
    if (!/^[a-f0-9]{64}$/.test(scope.tokenHash) || !/^[a-f0-9-]{36}$/.test(scope.replayId)
      || !/^[a-f0-9]{32}$/.test(scope.streamUid) || !Number.isFinite(Date.parse(scope.expiresAt))
      || Date.parse(scope.expiresAt) <= now || !Number.isSafeInteger(scope.maxBytes)
      || scope.maxBytes < 1024 || scope.maxBytes > 20 * 1024 ** 3) return null;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    let difference = 0;
    for (let i = 0; i < hash.length; i++) difference |= hash.charCodeAt(i) ^ scope.tokenHash.charCodeAt(i);
    return difference === 0 ? scope : null;
  } catch { return null; }
}
