/**
 * BTC amount conversion — BigInt-safe.
 *
 * Nguồn chân lý duy nhất cho phép chuyển satoshi ↔ BTC trong mọi edge function.
 * Không dùng Number()/parseFloat/(x / 1e8) ở bất kỳ đâu — sat là số nguyên,
 * giữ nguyên dạng BigInt/string, chia 10^8 bằng thao tác chuỗi.
 *
 * Sử dụng viem `formatUnits` (đã BigInt-safe và là dependency chung của project).
 *
 * Rule: token math BigInt-safe (sau sự cố mất 1.5 BNB 04/06/2026).
 */

import { formatUnits } from "npm:viem@2.21.19";

export const BTC_DECIMALS = 8;

/**
 * Chuyển satoshi (số nguyên) sang chuỗi BTC canonical.
 * - Chấp nhận input: number nguyên, bigint, hoặc chuỗi chỉ chứa chữ số (không dấu chấm).
 * - Output: chuỗi BTC đã trim trailing zeros ở phần thập phân;
 *   nếu là số nguyên BTC thì bỏ luôn dấu chấm.
 *
 * Ví dụ:
 *   satsToBtc(1)          -> "0.00000001"
 *   satsToBtc(100000000)  -> "1"
 *   satsToBtc(1160801899) -> "11.60801899"
 *   satsToBtc(1000000000) -> "10"
 *   satsToBtc(0)          -> "0"
 */
export function satsToBtc(sats: bigint | number | string): string {
  let bi: bigint;
  if (typeof sats === "bigint") {
    bi = sats;
  } else if (typeof sats === "number") {
    if (!Number.isFinite(sats) || !Number.isInteger(sats)) {
      throw new Error(`satsToBtc: expected integer sats, got ${sats}`);
    }
    bi = BigInt(sats);
  } else {
    const s = (sats ?? "").toString().trim();
    if (s === "" || !/^-?\d+$/.test(s)) {
      throw new Error(`satsToBtc: expected integer string sats, got "${sats}"`);
    }
    bi = BigInt(s);
  }

  // formatUnits trả về chuỗi kiểu "11.60801899" hoặc "1.0" hoặc "0"
  const raw = formatUnits(bi, BTC_DECIMALS);

  if (!raw.includes(".")) return raw;
  // Trim trailing zeros ở phần thập phân, và bỏ dấu chấm nếu phần thập phân rỗng.
  const [intPart, fracPart] = raw.split(".");
  const trimmedFrac = fracPart.replace(/0+$/, "");
  return trimmedFrac === "" ? intPart : `${intPart}.${trimmedFrac}`;
}
