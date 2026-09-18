/**
 * Username Validation — đồng bộ 1:1 với DB
 *
 * DB triggers (nguồn chân lý):
 * - `validate_username_format`: regex `^[a-z][a-z0-9_.]{2,29}$`
 *   ⇒ BẮT BUỘC ký tự đầu là chữ cái thường, dài 3–30.
 * - `check_reserved_username`: chặn danh sách reserved bên dưới.
 *
 * Frontend phải chặn TRƯỚC khi gọi API để user không nhận lỗi 500 vô nghĩa.
 */

/** Khớp chính xác regex DB: chữ cái đầu, sau đó a-z0-9._, tổng 3–30 ký tự */
export const USERNAME_REGEX = /^[a-z][a-z0-9_.]{2,29}$/;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/** Đồng bộ với `check_reserved_username()` trong DB */
export const RESERVED_USERNAMES = [
  'admin', 'administrator', 'system', 'root', 'moderator', 'mod',
  'support', 'help', 'lovable', 'supabase', 'null', 'undefined',
  'api', 'www', 'mail', 'email', 'test', 'demo',
] as const;

export function isReservedUsername(username: string): boolean {
  return (RESERVED_USERNAMES as readonly string[]).includes(username.trim().toLowerCase());
}

/**
 * Validate username format (client-side).
 * Trả về key thông báo lỗi hoặc null nếu hợp lệ.
 */
export function validateUsername(username: string): string | null {
  if (!username || username.length < USERNAME_MIN_LENGTH) {
    return 'authErrorUsernameShort';
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return 'authErrorUsernameLong';
  }
  if (username !== username.toLowerCase()) {
    return 'authErrorUsernameLowercase';
  }
  if (!USERNAME_REGEX.test(username)) {
    // gồm cả trường hợp bắt đầu bằng số hoặc dấu gạch dưới
    return 'authErrorUsernameFormat';
  }
  if (isReservedUsername(username)) {
    return 'authErrorUsernameReserved';
  }
  return null;
}

/**
 * Normalize username input: lowercase + trim
 */
export function normalizeUsername(input: string): string {
  return input.toLowerCase().trim();
}
