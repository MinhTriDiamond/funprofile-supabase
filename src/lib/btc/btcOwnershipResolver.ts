/**
 * Mirror thuần TS của resolve_btc_owner() / btc_normalize_address() trong
 * supabase/migrations/20260823124512_4f51231c-934e-4075-b833-6cf1e26a2135.sql.
 *
 * SSOT vẫn là hàm Postgres (mọi edge function/RPC gọi qua đó, không gọi module này).
 * Module này tồn tại để: (1) đặc tả rõ ràng ngữ nghĩa "sở hữu-theo-thời-gian" dưới dạng
 * có thể unit-test offline (time-travel: cùng địa chỉ, 2 mốc thời gian, 2 chủ khác nhau),
 * (2) làm tài liệu tham chiếu khi review logic SQL. Nếu sửa 1 bên, phải soi lại bên kia.
 */

export interface BtcOwnershipRow {
  address: string;
  user_id: string;
  verified_at: string | Date;
  valid_to?: string | Date | null;
}

/**
 * Địa chỉ bech32 (bc1q.../bc1p...) case-insensitive theo BIP-173 → lowercase an toàn.
 * Địa chỉ legacy base58 (1.../3...) case-SENSITIVE — lowercase vô điều kiện sẽ tạo ra
 * một địa chỉ khác/không hợp lệ (khác hành vi với norm()/normalizeBtcAddr() dùng ở các
 * scanner hiện có, vốn toLowerCase() vô điều kiện).
 */
export function btcNormalizeAddress(address: string): string {
  const trimmed = (address ?? "").trim();
  return /^bc1[a-z0-9]+$/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

/**
 * Suy ra chủ sở hữu của `address` tại thời điểm `at`, theo đúng predicate SQL:
 *   verified_at <= at AND (valid_to IS NULL OR valid_to > at)
 * lấy dòng verified_at mới nhất thoả điều kiện. Không có kết quả → null (không suy luận).
 */
export function resolveBtcOwnerAt(
  history: BtcOwnershipRow[],
  address: string,
  at: Date,
): string | null {
  const target = btcNormalizeAddress(address);
  const atMs = at.getTime();

  const candidates = history.filter((row) => {
    if (btcNormalizeAddress(row.address) !== target) return false;
    const verifiedAtMs = new Date(row.verified_at).getTime();
    if (verifiedAtMs > atMs) return false;
    if (row.valid_to != null && new Date(row.valid_to).getTime() <= atMs) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime());
  return candidates[0].user_id;
}
