/**
 * Đối chiếu ví trong lệnh claim với ví đã đăng ký ở `profiles.public_wallet_address`.
 *
 * Chính sách (2026-08-16): KHÔNG chặn user rút về ví khác, chỉ gắn cờ cảnh báo
 * trong giao diện admin duyệt. Logic phải khớp `supabase/functions/claim-reward/walletMatch.ts`.
 */

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

export function normalizeWallet(addr: string | null | undefined): string | null {
  const v = (addr ?? '').trim();
  return EVM_RE.test(v) ? v.toLowerCase() : null;
}

/**
 * true khi cần cảnh báo admin: ví yêu cầu khác ví đăng ký, hoặc profile không có
 * ví đăng ký hợp lệ để đối chiếu.
 */
export function isClaimWalletMismatch(
  requestedWallet: string | null | undefined,
  registeredWallet: string | null | undefined,
): boolean {
  const requested = normalizeWallet(requestedWallet);
  const registered = normalizeWallet(registeredWallet);
  if (!requested) return true;
  if (!registered) return true;
  return requested !== registered;
}
