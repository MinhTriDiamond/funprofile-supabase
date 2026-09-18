/**
 * Cảnh báo chủ động cho bộ quét RPC (compare-only Giai đoạn 1).
 *
 * Lý do tồn tại: bảng `notifications` KHÔNG có cột `title`/`content` (chỉ có
 * user_id, actor_id, type, metadata). Bản cũ insert title/content ⇒ insert lỗi
 * âm thầm ⇒ admin không bao giờ nhận cảnh báo (vụ 300 USDT 20/08/2026 do Cha
 * phát hiện tay). Mọi nội dung cảnh báo phải nằm trong `metadata`.
 */

export interface ScannerMissingCandidate {
  tx_hash: string;
  block: number;
  from: string;
  to: string;
  amount: string;
  symbol: string;
  source: string;
}

export interface ScannerAlertRow {
  user_id: string;
  actor_id: string;
  type: "wallet_reconciliation_alert";
  metadata: Record<string, unknown>;
}

export const SCANNER_ALERT_SOURCE = "scanner_rpc_compare";
export const SCANNER_ALERT_DEDUPE_MS = 6 * 3600_000;
const MAX_SAMPLE = 10;

/** Tạo 1 dòng notification cho mỗi admin, nội dung nằm hoàn toàn trong metadata. */
export function buildScannerAlertRows(
  adminIds: string[],
  missing: ScannerMissingCandidate[],
  candidatesTotal: number,
  actorId?: string,
): ScannerAlertRow[] {
  if (missing.length === 0 || adminIds.length === 0) return [];
  const samples = missing.slice(0, MAX_SAMPLE).map((m) => ({
    tx_hash: m.tx_hash,
    block: m.block,
    from: m.from,
    to: m.to,
    amount: m.amount,
    symbol: m.symbol,
    source: m.source,
  }));
  const wallets = [...new Set(missing.map((m) => m.to.toLowerCase()))].slice(0, MAX_SAMPLE);
  return adminIds.map((id) => ({
    user_id: id,
    actor_id: actorId ?? id,
    type: "wallet_reconciliation_alert" as const,
    metadata: {
      source: SCANNER_ALERT_SOURCE,
      mode: "compare_only_phase1",
      missing_count: missing.length,
      candidates_total: candidatesTotal,
      wallets,
      samples,
      detected_at: new Date().toISOString(),
      note:
        `Bộ quét RPC phát hiện ${missing.length} giao dịch on-chain chưa có trong ` +
        `donations/transactions. Cần backfill tay ngay (compare-only chưa tự ghi).`,
    },
  }));
}

/**
 * Cảnh báo NGUỒN QUÉT CHẾT (mục 1 lệnh 15/09/2026).
 *
 * Bài học: Moralis trả 401 suốt 12 ngày mà không có 1 notification nào — chỉ phát
 * hiện khi người kiểm tra tình cờ mở log. Từ nay watchdog chạy mỗi 15 phút và cảnh
 * báo khi bất kỳ nguồn quét nào lỗi/đứng liên tục quá 1 giờ.
 */
export const SCANNER_HEALTH_SOURCE = "scanner_health_watchdog";
export const SCANNER_HEALTH_DEDUPE_MS = 3 * 3600_000;

export interface ScannerHealthProblem {
  /** 'rpc_tick' | 'watermark_stalled' | 'moralis' | 'gaps_unresolved' */
  kind: string;
  /** nguồn cụ thể: 'scanner-rpc-tick', 'erc20:CAMLY', 'moralis' ... */
  source: string;
  /** số phút đã lỗi/đứng liên tục */
  stalled_minutes: number;
  detail: string;
}

export function buildScannerHealthAlertRows(
  adminIds: string[],
  problems: ScannerHealthProblem[],
  actorId?: string,
): ScannerAlertRow[] {
  if (problems.length === 0 || adminIds.length === 0) return [];
  return adminIds.map((id) => ({
    user_id: id,
    actor_id: actorId ?? id,
    type: "wallet_reconciliation_alert" as const,
    metadata: {
      source: SCANNER_HEALTH_SOURCE,
      severity: "critical",
      problem_count: problems.length,
      problems: problems.slice(0, MAX_SAMPLE),
      detected_at: new Date().toISOString(),
      note:
        `NGUỒN QUÉT ON-CHAIN ĐANG CHẾT: ${
          problems.map((p) => `${p.source} (${p.stalled_minutes} phút)`).join(", ")
        }. Hệ thống có thể đang MÙ dữ liệu ví ngoài — kiểm tra ngay.`,
    },
  }));
}
