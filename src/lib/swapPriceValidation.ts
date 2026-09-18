/**
 * swapPriceValidation — bản mirror TypeScript của trigger
 * `public.swap_price_validation_logonly()` (Giai đoạn 1 · LOG-ONLY)
 * và của logic enforce dự kiến ở Giai đoạn 2.
 *
 * Cùng mô hình đã dùng cho `donations_set_usd_default()`
 * (xem `src/lib/donationPriceValidation.ts`).
 *
 * Khi sửa trigger, PHẢI sửa file này cùng lúc (và ngược lại).
 *
 * Quy tắc:
 *  - FUN (token testnet) → `testnet_skip`, không so sánh.
 *  - Không có `code_amount_usd` → `no_code_price` / `no_code_no_history`.
 *  - Không có giá lịch sử cùng ngày → `no_history`.
 *  - Có cả hai → lệch > 2% ⇒ `would_fail`, ngược lại `ok`.
 *
 * GIAI ĐOẠN 1 (log-only): CHỈ ghi log, KHÔNG bao giờ đổi giá USD đang lưu.
 * GIAI ĐOẠN 2 (enforce): chỉ bật sau khi CTO duyệt số liệu log-only;
 *   khi đó `would_fail` ⇒ amount_usd = null, verdict `validation_failed`.
 */

export const SWAP_PRICE_TOLERANCE_PCT = 2; // 2%

export type SwapSide = 'from' | 'to';

export type SwapPriceVerdict =
  | 'testnet_skip'
  | 'no_code_price'
  | 'no_code_no_history'
  | 'no_history'
  | 'ok'
  | 'would_fail'
  | 'validation_failed';

export interface SwapLegInput {
  side: SwapSide;
  token_symbol: string;
  /** Số lượng token của leg (decimal string hoặc number đã an toàn). */
  amount: number;
  /** USD do client khai (nullable). */
  code_amount_usd?: number | null;
  /** Giá lịch sử `token_price_history` cùng ngày, null nếu không có. */
  historyPrice?: number | null;
}

export interface SwapLegLogRow {
  side: SwapSide;
  token_symbol: string;
  amount: number;
  code_amount_usd: number | null;
  code_price_usd: number | null;
  history_price_usd: number | null;
  diff_pct: number | null;
  verdict: SwapPriceVerdict;
  phase: 'log_only' | 'enforce';
}

/** Giai đoạn 1: chỉ tính verdict để ghi log. KHÔNG trả về giá trị áp dụng. */
export function evaluateSwapLeg(input: SwapLegInput): SwapLegLogRow {
  const symbol = (input.token_symbol || '').toUpperCase();
  const codeUsd = input.code_amount_usd ?? null;
  const history = input.historyPrice ?? null;

  const base = {
    side: input.side,
    token_symbol: symbol,
    amount: input.amount,
    code_amount_usd: codeUsd,
    phase: 'log_only' as const,
  };

  if (symbol === 'FUN') {
    return { ...base, code_price_usd: null, history_price_usd: null, diff_pct: null, verdict: 'testnet_skip' };
  }

  const codePrice = codeUsd != null && input.amount > 0 ? codeUsd / input.amount : null;

  if (codeUsd == null) {
    return {
      ...base,
      code_price_usd: null,
      history_price_usd: history,
      diff_pct: null,
      verdict: history == null ? 'no_code_no_history' : 'no_code_price',
    };
  }

  if (history == null || history <= 0 || codePrice == null) {
    return { ...base, code_price_usd: codePrice, history_price_usd: history, diff_pct: null, verdict: 'no_history' };
  }

  const diffPct = (Math.abs(codePrice - history) / history) * 100;
  return {
    ...base,
    code_price_usd: codePrice,
    history_price_usd: history,
    diff_pct: diffPct,
    verdict: diffPct > SWAP_PRICE_TOLERANCE_PCT ? 'would_fail' : 'ok',
  };
}

/**
 * GIAI ĐOẠN 1 — bất biến bắt buộc: giá USD lưu trong `swap_transactions`
 * KHÔNG bị thay đổi bởi logic validate. Hàm này mô phỏng giá trị được lưu.
 */
export function applySwapPriceLogOnly(input: SwapLegInput): { amount_usd: number | null } {
  return { amount_usd: input.code_amount_usd ?? null };
}

/**
 * GIAI ĐOẠN 2 (chưa bật) — enforce: verdict `would_fail` ⇒ bỏ giá client khai.
 * Chỉ dùng khi CTO duyệt số liệu log-only.
 */
export function applySwapPriceEnforce(input: SwapLegInput): {
  amount_usd: number | null;
  verdict: SwapPriceVerdict;
} {
  const evaluated = evaluateSwapLeg(input);
  if (evaluated.verdict === 'would_fail') {
    return { amount_usd: null, verdict: 'validation_failed' };
  }
  return { amount_usd: input.code_amount_usd ?? null, verdict: evaluated.verdict };
}
