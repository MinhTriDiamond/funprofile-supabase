/**
 * Xác thực client_secret cho các luồng SSO.
 *
 * Hỗ trợ 2 dạng giá trị lưu trong `oauth_clients.client_secret`:
 *  - bcrypt hash (bắt đầu bằng `$2`) → so sánh bằng bcrypt.compare
 *  - plaintext (legacy, đang được migrate) → so sánh chuỗi thời gian hằng
 *
 * Bên gọi (client) LUÔN gửi secret thô. Nhờ vậy có thể hash lại secret trong DB
 * mà không gãy tích hợp.
 */
import bcrypt from "npm:bcryptjs@2.4.3";

export function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]?\$/.test(stored);
}

/** So sánh chuỗi thời gian hằng (chống timing attack). */
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export async function verifyClientSecret(
  stored: string | null | undefined,
  provided: string | null | undefined,
): Promise<boolean> {
  if (!stored) return true; // client không đặt secret
  if (!provided) return false;
  if (isBcryptHash(stored)) {
    try {
      return await bcrypt.compare(provided, stored);
    } catch {
      return false;
    }
  }
  return timingSafeEqual(stored, provided);
}
