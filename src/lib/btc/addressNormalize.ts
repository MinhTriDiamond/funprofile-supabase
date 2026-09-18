import { btcNormalizeAddress } from "./btcOwnershipResolver";

/**
 * Chuẩn hoá địa chỉ ví cho mục đích SO SÁNH/DEDUPE khi dữ liệu trộn nhiều chain.
 *  - EVM (`0x…`): lowercase (case-insensitive).
 *  - BTC bech32 (`bc1…`): lowercase (BIP-173).
 *  - BTC legacy Base58 (`1…` / `3…`): CHỈ trim — case-SENSITIVE, lowercase sẽ làm sai địa chỉ.
 */
export function normalizeAddressForCompare(address: string | null | undefined): string {
  const trimmed = (address ?? "").trim();
  if (!trimmed) return "";
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return trimmed.toLowerCase();
  return btcNormalizeAddress(trimmed);
}

/** Nhận dạng loại địa chỉ BTC theo prefix (case-insensitive, không biến dạng địa chỉ). */
export function detectBtcAddressType(address: string | null | undefined): string {
  const a = (address ?? "").trim();
  if (/^bc1p/i.test(a)) return "p2tr";
  if (/^bc1q/i.test(a)) return "p2wpkh";
  if (/^bc1/i.test(a)) return "segwit";
  if (/^3/.test(a)) return "p2sh";
  if (/^1/.test(a)) return "p2pkh";
  return "unknown";
}
