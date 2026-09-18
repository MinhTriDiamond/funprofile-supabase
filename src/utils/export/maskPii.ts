/**
 * Mask PII cho dữ liệu export khi không phải owner.
 * - Owner export dữ liệu của chính mình: KHÔNG mask, hiện full tx hash / wallet / email.
 * - Admin export hộ / public export: PHẢI mask.
 */

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0] ?? '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

export function maskWallet(addr: string | null | undefined): string {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function maskTxHash(hash: string | null | undefined): string {
  if (!hash) return '';
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function applyMask<T extends object>(
  row: T,
  isOwner: boolean,
  fields: { wallet?: (keyof T)[]; email?: (keyof T)[]; hash?: (keyof T)[] }
): T {
  if (isOwner) return row;
  const out: T = { ...row };
  (fields.wallet ?? []).forEach(k => {
    (out as Record<keyof T, unknown>)[k] = maskWallet((out as Record<keyof T, unknown>)[k] as string | null);
  });
  (fields.email ?? []).forEach(k => {
    (out as Record<keyof T, unknown>)[k] = maskEmail((out as Record<keyof T, unknown>)[k] as string | null);
  });
  (fields.hash ?? []).forEach(k => {
    (out as Record<keyof T, unknown>)[k] = maskTxHash((out as Record<keyof T, unknown>)[k] as string | null);
  });
  return out;
}

