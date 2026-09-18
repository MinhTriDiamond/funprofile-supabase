/**
 * Bảo vệ SSRF cho các endpoint proxy (image-transform, fetch-link-preview).
 *
 * Chỉ cho phép http/https tới host công khai. Chặn loopback, RFC1918,
 * link-local (bao gồm 169.254.169.254 metadata), CGNAT, và IPv6 tương ứng.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'kubernetes.default.svc',
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const ip = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (ip === '::' || ip === '::1') return true;
  if (ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * Trả về URL đã chuẩn hoá nếu an toàn, ngược lại trả về null.
 */
export function safePublicUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const host = u.hostname.toLowerCase();
  if (!host) return null;
  if (BLOCKED_HOSTNAMES.has(host)) return null;
  if (host.endsWith('.internal') || host.endsWith('.local') || host.endsWith('.localhost')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateIPv4(host)) return null;
  if (host.includes(':') && isPrivateIPv6(host)) return null;
  if (u.hostname.startsWith('[') && isPrivateIPv6(u.hostname)) return null;

  return u;
}

export function isSafePublicUrl(raw: string | null | undefined): boolean {
  return safePublicUrl(raw) !== null;
}
