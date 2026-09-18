/**
 * donationPriceValidation — bản mirror TypeScript của logic trigger
 * `public.donations_set_usd_default()` (Giai đoạn 2 / enforce).
 *
 * Mục đích: có guard Vitest chạy được ở CI cho đúng 4 quy tắc đã chốt,
 * vì logic thật nằm trong PL/pgSQL không test trực tiếp được ở đây.
 * Khi sửa trigger, PHẢI sửa file này cùng lúc (và ngược lại).
 *
 * Quy tắc (chốt bởi Cha + CTO, giai đoạn B4 / enforce SSOT):
 *  1. FUN → luôn testnet_skip, amount_usd = null.
 *  2. Symbol được chuẩn hoá qua normalizePriceSymbol (mirror của
 *     public.normalize_price_symbol): TONCOIN→TON, WBNB→BNB, WBTC→BTC.
 *  3. Code KHÔNG truyền amount_usd:
 *     - có giá lịch sử đúng ngày → 'historical'.
 *     - không có giá đúng ngày nhưng có giá trong cửa sổ 7 ngày trước →
 *       'historical_nearby'.
 *     - KHÔNG có giá nào → amount_usd = null, price_source = 'pending'
 *       (KHÔNG còn fallback hardcode 'reference').
 *  4. Code CÓ truyền amount_usd:
 *     - có giá lịch sử đúng ngày, lệch > 2% → amount_usd = null,
 *       price_source = 'validation_failed', ghi 1 row audit log.
 *     - lệch <= 2% → giữ nguyên.
 *     - KHÔNG có giá lịch sử để đối chiếu → giữ nguyên giá code truyền.
 */

export const PRICE_VALIDATION_TOLERANCE = 0.02; // 2%

const SYMBOL_ALIASES: Record<string, string> = {
  TONCOIN: 'TON',
  WBNB: 'BNB',
  WBTC: 'BTC',
};

/** Mirror của public.normalize_price_symbol */
export function normalizePriceSymbol(symbol: string | null | undefined): string {
  const s = (symbol ?? '').trim().toUpperCase();
  return SYMBOL_ALIASES[s] ?? s;
}

export interface DonationPriceInput {
  token_symbol: string;
  amount: number;
  /** Giá USD code truyền sẵn (nullable) */
  amount_usd?: number | null;
  price_source?: string | null;
  /** Giá lịch sử token_price_history ĐÚNG ngày, null nếu không có */
  historyPrice?: number | null;
  /** Giá gần nhất trong cửa sổ 7 ngày trước (get_token_price_at), null nếu không có */
  nearbyPrice?: number | null;
}


export interface DonationPriceResult {
  amount_usd: number | null;
  price_usd_at_donation: number | null;
  price_source: string | null;
  /** Có ghi row vào donation_price_validation_log hay không */
  auditLog: null | {
    code_price_usd: number | null;
    history_price_usd: number;
    diff_pct: number;
    verdict: 'validation_failed';
  };
}

export function resolveDonationPrice(input: DonationPriceInput): DonationPriceResult {
  const sym = normalizePriceSymbol(input.token_symbol);
  const history = input.historyPrice ?? null;
  const nearby = input.nearbyPrice ?? null;


  if (sym === 'FUN') {
    return { amount_usd: null, price_usd_at_donation: null, price_source: 'testnet_skip', auditLog: null };
  }

  // Nhánh code truyền sẵn amount_usd
  if (input.amount_usd != null) {
    const codePrice = input.amount > 0 ? input.amount_usd / input.amount : null;

    // Không có cơ sở đối chiếu → giữ nguyên
    if (history == null || codePrice == null) {
      return {
        amount_usd: input.amount_usd,
        price_usd_at_donation: codePrice,
        price_source: input.price_source ?? null,
        auditLog: null,
      };
    }

    const diffPct = Math.abs(codePrice - history) / history;
    if (diffPct > PRICE_VALIDATION_TOLERANCE) {
      return {
        amount_usd: null,
        price_usd_at_donation: null,
        price_source: 'validation_failed',
        auditLog: {
          code_price_usd: codePrice,
          history_price_usd: history,
          diff_pct: diffPct * 100,
          verdict: 'validation_failed',
        },
      };
    }

    return {
      amount_usd: input.amount_usd,
      price_usd_at_donation: codePrice,
      price_source: input.price_source ?? null,
      auditLog: null,
    };
  }

  // Nhánh code không truyền giá
  if (history != null) {
    return {
      amount_usd: input.amount * history,
      price_usd_at_donation: history,
      price_source: 'historical',
      auditLog: null,
    };
  }

  if (nearby != null) {
    return {
      amount_usd: input.amount * nearby,
      price_usd_at_donation: nearby,
      price_source: 'historical_nearby',
      auditLog: null,
    };
  }

  // KHÔNG fallback hardcode nữa
  return { amount_usd: null, price_usd_at_donation: null, price_source: 'pending', auditLog: null };
}

