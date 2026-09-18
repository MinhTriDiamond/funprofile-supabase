// scanCore.ts — LÕI QUÉT DÙNG CHUNG cho `scanner-rpc-tick` (cron sản xuất) và
// `admin-backfill-scan` (quét bù theo yêu cầu admin).
//
// Nguyên tắc: KHÔNG copy hằng số token/ngưỡng dust sang function khác. Mọi nơi
// import từ đây để hai đường quét không bao giờ lệch nhau.
// Không dùng float cho số tiền: so sánh bằng chuỗi thập phân + BigInt.

export const CHAIN_ID = 56;

export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface TokenMeta {
  symbol: string;
  decimals: number;
  /** Ngưỡng tối thiểu (chuỗi thập phân) — dưới mức này là bụi spam. */
  min: string;
}

export const TOKENS: Record<string, TokenMeta> = {
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18, min: "0.01" },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { symbol: "BTCB", decimals: 18, min: "0.0001" },
  "0x0910320181889fefde0bb1ca63962b0a8882e413": { symbol: "CAMLY", decimals: 3, min: "1" },
  "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6": { symbol: "FUN", decimals: 18, min: "1" },
};

export const NATIVE_MIN = "0.001";
export const NATIVE_DECIMALS = 18;

/** ~3 giây/block trên BSC (đo dài hạn) — dùng để quy đổi thời gian → block. */
export const BSC_BLOCK_SECONDS = 3;

export function topicToAddress(topic: string): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

/** So sánh chuỗi số thập phân không dùng float (tránh mất precision). */
export function gteDecimal(a: string, b: string): boolean {
  const norm = (s: string): [bigint, string] => {
    const [i, f = ""] = s.split(".");
    return [BigInt(i || "0"), (f + "0".repeat(18)).slice(0, 18)];
  };
  const [ai, af] = norm(a);
  const [bi, bf] = norm(b);
  if (ai !== bi) return ai > bi;
  return BigInt(af) >= BigInt(bf);
}

export function minForSymbol(symbol: string): string {
  if (symbol === "BNB") return NATIVE_MIN;
  const found = Object.values(TOKENS).find((t) => t.symbol === symbol);
  return found?.min ?? "0";
}

export type Classification =
  | "internal"
  | "external_in"
  | "swap_suspect"
  | "dust_filtered"
  | "already_in_db";

export interface RawCandidate {
  tx_hash: string;
  log_index: number;
  block_number: number;
  from_address: string;
  to_address: string;
  token_symbol: string;
  token_address: string | null;
  amount_raw: string;
  amount_display: string;
}

export interface ClassifiedCandidate extends RawCandidate {
  classification: Classification;
  skip_reason: string | null;
}

/**
 * Phân loại candidate cho Preview của admin.
 *
 * Thứ tự ưu tiên (cố định, có Vitest guard):
 * 1. `already_in_db`  — tx_hash đã tồn tại trong donations/transactions.
 * 2. `dust_filtered`  — dưới ngưỡng min của token.
 * 3. `swap_suspect`   — cùng tx_hash nhưng ≥2 token khác nhau (2 chân swap)
 *                       ⇒ chỉ lưu vết `transactions`, KHÔNG ghi `donations`.
 * 4. `internal`       — cả from và to là ví hệ thống.
 * 5. `external_in`    — from là ví ngoài.
 */
export function classifyCandidates(
  raws: RawCandidate[],
  systemWallets: Set<string>,
  knownHashes: Set<string>,
): ClassifiedCandidate[] {
  const symbolsByTx = new Map<string, Set<string>>();
  for (const r of raws) {
    const s = symbolsByTx.get(r.tx_hash) ?? new Set<string>();
    s.add(r.token_symbol);
    symbolsByTx.set(r.tx_hash, s);
  }

  return raws.map((r) => {
    const from = r.from_address.toLowerCase();
    const to = r.to_address.toLowerCase();

    if (knownHashes.has(r.tx_hash)) {
      return { ...r, classification: "already_in_db" as Classification, skip_reason: "đã có trong DB" };
    }
    if (!gteDecimal(r.amount_display, minForSymbol(r.token_symbol))) {
      return {
        ...r,
        classification: "dust_filtered" as Classification,
        skip_reason: `dưới ngưỡng ${minForSymbol(r.token_symbol)} ${r.token_symbol}`,
      };
    }
    if ((symbolsByTx.get(r.tx_hash)?.size ?? 0) > 1) {
      return {
        ...r,
        classification: "swap_suspect" as Classification,
        skip_reason: "nghi ngờ swap (≥2 token cùng tx) — chỉ lưu vết transactions",
      };
    }
    if (systemWallets.has(from) && systemWallets.has(to)) {
      return { ...r, classification: "internal" as Classification, skip_reason: null };
    }
    return { ...r, classification: "external_in" as Classification, skip_reason: null };
  });
}

/** Quy đổi mốc thời gian → block gần đúng dựa trên head hiện tại. */
export function estimateBlockAt(
  headBlock: number,
  headTsMs: number,
  targetTsMs: number,
): number {
  const deltaSec = Math.floor((headTsMs - targetTsMs) / 1000);
  const block = headBlock - Math.floor(deltaSec / BSC_BLOCK_SECONDS);
  return Math.max(1, Math.min(headBlock, block));
}
