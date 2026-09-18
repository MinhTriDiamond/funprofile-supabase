// Chia lô ví hệ thống cho `eth_getLogs` (topics[2] = recipient).
//
// Node công khai có TRẦN số topic trong 1 filter (đã đo thực tế: 1.014 ví →
// "exceed max topics"). Vì vậy phải chia lô ≤ WALLET_TOPIC_BATCH_SIZE ví/call
// rồi gộp kết quả.
//
// NGUYÊN TẮC WATERMARK (bất biến): chỉ advance watermark cho một khoảng block
// khi TẤT CẢ các lô ví đều quét thành công cho khoảng đó. Một lô lỗi ⇒ coi cả
// khoảng là chưa quét (ghi scanner_block_gaps, không advance).

export const WALLET_TOPIC_BATCH_SIZE = 400;

export function addressToTopic(addr: string): string {
  return "0x" + addr.toLowerCase().slice(2).padStart(64, "0");
}

export function chunkTopics<T>(items: T[], size = WALLET_TOPIC_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error("size phải > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// deno-lint-ignore no-explicit-any
export type RpcLog = any;

export interface SegmentFetcher {
  (topicBatch: string[], from: number, to: number): Promise<
    { logs: RpcLog[]; to: number } | null
  >;
}

export interface SegmentResult {
  logs: RpcLog[];
  /** Block cuối cùng ĐÃ QUÉT THÀNH CÔNG BỞI MỌI LÔ. null = không advance. */
  reached: number | null;
}

/**
 * Quét 1 khoảng block cho toàn bộ lô ví.
 * - Lô nào lỗi (fetcher trả null) ⇒ reached = null (KHÔNG advance watermark).
 * - Các lô có thể bị endpoint cắt span khác nhau ⇒ reached = min(to) và chỉ
 *   giữ log có blockNumber ≤ reached để không bỏ sót phần chưa phủ hết.
 */
export async function scanSegmentAllBatches(
  topicBatches: string[][],
  from: number,
  to: number,
  fetcher: SegmentFetcher,
): Promise<SegmentResult> {
  if (topicBatches.length === 0) return { logs: [], reached: to };

  const logs: RpcLog[] = [];
  let reached: number | null = null;

  for (const batch of topicBatches) {
    const res = await fetcher(batch, from, to);
    if (!res) return { logs: [], reached: null };
    reached = reached === null ? res.to : Math.min(reached, res.to);
    logs.push(...res.logs);
  }

  const cap = reached as number;
  const kept = logs.filter((l) => {
    const bn = l?.blockNumber;
    if (bn === undefined || bn === null) return true;
    const n = typeof bn === "string" ? Number(BigInt(bn)) : Number(bn);
    return !Number.isFinite(n) || n <= cap;
  });
  return { logs: kept, reached: cap };
}
