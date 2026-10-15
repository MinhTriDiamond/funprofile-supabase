/**
 * Xác thực client_secret cho các luồng SSO.
 *
 * SSO hardening 2026-10-15 (T1): mọi client trong `oauth_clients` đều đã
 * migrate sang bcrypt (kiểm chứng trên DB đích 2026-10-15 — cả 4 client đều
 * là hash $2, 60 ký tự), nên fallback plaintext legacy đã được GỠ BỎ.
 * Client không có secret trong DB => xác thực THẤT BẠI (trước đây trả true,
 * nghĩa là client thiếu secret thì ai gọi cũng qua).
 *
 * Bên gọi (client) LUÔN gửi secret thô; DB chỉ lưu bcrypt hash.
 */
import bcrypt from "npm:bcryptjs@2.4.3";

export function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]?\$/.test(stored);
}

export async function verifyClientSecret(
  stored: string | null | undefined,
  provided: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false; // client không có secret hợp lệ => không xác thực được
  if (!provided) return false;
  if (!isBcryptHash(stored)) return false; // chỉ chấp nhận bcrypt hash
  try {
    return await bcrypt.compare(provided, stored);
  } catch {
    return false;
  }
}
