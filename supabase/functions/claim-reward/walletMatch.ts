/**
 * Đối chiếu ví yêu cầu rút với ví đã đăng ký trong `profiles.public_wallet_address`.
 *
 * Chính sách (Cha chốt 2026-08-16): KHÔNG chặn cứng khi lệch ví — vẫn cho tạo
 * lệnh claim, nhưng gắn cờ để admin thấy rõ khi duyệt. Đây là lớp phòng thủ
 * bổ sung, không thay thế bước admin duyệt.
 */

export interface WalletMatchResult {
  /** true nếu ví yêu cầu khớp ví đăng ký (so sánh sau lowercase). */
  matches: boolean;
  /** true nếu profile chưa có ví đăng ký hợp lệ ⇒ không thể đối chiếu. */
  unknownRegistered: boolean;
  /** Ví đăng ký đã lowercase, null nếu không có/không hợp lệ. */
  registered: string | null;
  /** Ví yêu cầu đã lowercase. */
  requested: string;
  /** Cờ dùng cho audit/notify: 'match' | 'mismatch' | 'no_registered_wallet'. */
  flag: 'match' | 'mismatch' | 'no_registered_wallet';
}

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

export function compareClaimWallet(
  requestedWallet: string,
  registeredWallet: string | null | undefined,
): WalletMatchResult {
  const requested = (requestedWallet ?? '').trim().toLowerCase();
  const regRaw = (registeredWallet ?? '').trim();
  const registered = EVM_RE.test(regRaw) ? regRaw.toLowerCase() : null;

  if (!registered) {
    return {
      matches: false,
      unknownRegistered: true,
      registered: null,
      requested,
      flag: 'no_registered_wallet',
    };
  }

  const matches = registered === requested;
  return {
    matches,
    unknownRegistered: false,
    registered,
    requested,
    flag: matches ? 'match' : 'mismatch',
  };
}
