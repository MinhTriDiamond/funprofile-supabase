/**
 * SSOT (TS mirror) cho chuẩn hoá địa chỉ BTC — bám theo hàm Postgres
 * `public.btc_normalize_address()` (migration 20260823124512_…) và
 * `src/lib/btc/btcOwnershipResolver.ts::btcNormalizeAddress()`.
 *
 * QUY TẮC BẮT BUỘC:
 *  - bech32 (`bc1q…` / `bc1p…`): case-insensitive theo BIP-173 ⇒ lowercase an toàn.
 *  - legacy Base58 (`1…` / `3…`): case-SENSITIVE ⇒ CHỈ trim, TUYỆT ĐỐI không lowercase
 *    (lowercase sẽ tạo ra chuỗi khác/không hợp lệ checksum ⇒ query sai, bỏ sót quét).
 *
 * Mọi đường ghi/đọc/so sánh địa chỉ BTC trong edge function phải dùng hàm này.
 */
export function btcNormalizeAddress(address: string | null | undefined): string {
  const trimmed = (address ?? "").trim();
  return /^bc1[a-z0-9]+$/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

/** Nhận dạng loại địa chỉ BTC theo prefix (case-insensitive, KHÔNG biến dạng địa chỉ). */
export function detectBtcAddressType(address: string | null | undefined): string {
  const a = (address ?? "").trim();
  if (/^bc1p/i.test(a)) return "p2tr";
  if (/^bc1q/i.test(a)) return "p2wpkh";
  if (/^bc1/i.test(a)) return "segwit";
  if (/^3/.test(a)) return "p2sh";
  if (/^1/.test(a)) return "p2pkh";
  return "unknown";
}
