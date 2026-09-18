/**
 * B3 guard test — 3 hàm tổng hợp USD (get_app_stats, get_global_gift_breakdown,
 * get_global_wallet_flow_breakdown) dùng CHUNG helper public.normalize_price_map:
 *   normalize_price_symbol → lọc NULL → GROUP BY sym → MAX(price)
 * và KHÔNG còn bảng fallback_prices hardcode (BTC 100k / CAMLY 0.000014 /
 * BNB 700 / TONCOIN 5).
 *
 * Mirror logic đã deploy. Nếu sửa RPC, phải sửa file này.
 */
import { describe, it, expect } from 'vitest';

const SYMBOL_ALIASES: Record<string, string> = {
  TONCOIN: 'TON',
  WBNB: 'BNB',
  WBTC: 'BTC',
  BTCB: 'BTC',
};

/** Mirror public.normalize_price_symbol */
function normalizePriceSymbol(symbol: string): string {
  const s = (symbol ?? '').trim().toUpperCase();
  return SYMBOL_ALIASES[s] ?? s;
}

/** Mirror public.normalize_price_map(jsonb) → (sym, price) */
export function normalizePriceMap(
  prices: Record<string, number | null> | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(prices ?? {})) {
    if (v == null) continue;
    const sym = normalizePriceSymbol(k);
    if (!sym) continue;
    out[sym] = out[sym] == null ? v : Math.max(out[sym], v);
  }
  return out;
}

const SSOT: Record<string, number> = {
  BTC: 77673,
  BNB: 688.9,
  USDT: 0.999982,
  CAMLY: 0.00000296,
  TON: 1.36,
};

/** Giá SSOT: mirror get_token_price_now (NULL nếu không có nguồn) */
const priceNow = (sym: string): number | null => SSOT[sym] ?? null;

interface Agg {
  symbol: string;
  amount: number;
  rows: number;
}

/** Mirror phần định giá dùng chung của cả 3 hàm */
function priceAggs(aggs: Agg[], external: Record<string, number | null> | null) {
  const ext = normalizePriceMap(external);
  return aggs.map((a) => {
    const sym = normalizePriceSymbol(a.symbol);
    const price = ext[sym] ?? priceNow(sym);
    return { sym, amount: a.amount, rows: a.rows, price, usd: a.amount * (price ?? 0) };
  });
}

/** get_app_stats: 1 tổng USD */
const appStatsUsd = (aggs: Agg[], ext: Record<string, number | null> | null = null) =>
  priceAggs(aggs, ext).reduce((s, r) => s + (r.price == null ? 0 : r.usd), 0);

/** get_global_gift_breakdown: từng dòng token, sắp theo USD desc */
const giftBreakdown = (aggs: Agg[], ext: Record<string, number | null> | null = null) =>
  priceAggs(aggs, ext).sort((a, b) => b.usd - a.usd);

/** get_global_wallet_flow_breakdown: nhiều nguồn union rồi định giá cùng cách */
const walletFlowBreakdown = (aggs: Agg[], ext: Record<string, number | null> | null = null) =>
  priceAggs(aggs, ext);

const FNS: Array<{
  name: string;
  totalUsd: (aggs: Agg[], ext?: Record<string, number | null> | null) => number;
  src: string;
}> = [
  { name: 'get_app_stats', totalUsd: (a, e = null) => appStatsUsd(a, e), src: appStatsUsd.toString() },
  {
    name: 'get_global_gift_breakdown',
    totalUsd: (a, e = null) => giftBreakdown(a, e).reduce((s, r) => s + r.usd, 0),
    src: giftBreakdown.toString(),
  },
  {
    name: 'get_global_wallet_flow_breakdown',
    totalUsd: (a, e = null) => walletFlowBreakdown(a, e).reduce((s, r) => s + r.usd, 0),
    src: walletFlowBreakdown.toString(),
  },
];

const REAL_AGGS: Agg[] = [
  { symbol: 'BTC', amount: 15.76136027, rows: 124 },
  { symbol: 'BNB', amount: 135.881227, rows: 1737 },
  { symbol: 'CAMLY', amount: 31_653_567_402.76, rows: 21675 },
  { symbol: 'USDT', amount: 5847.12, rows: 5847 },
  { symbol: 'TONCOIN', amount: 2, rows: 1 },
];

const ALIAS_MAP = {
  BTC: SSOT.BTC,
  WBTC: SSOT.BTC,
  BTCB: SSOT.BTC,
  BNB: SSOT.BNB,
  WBNB: SSOT.BNB,
};

describe('B3 — normalize_price_map dùng chung cho 3 hàm', () => {
  it('helper: alias trùng khử về 1 dòng, lấy MAX khi lệch, bỏ NULL', () => {
    expect(normalizePriceMap({ BTC: 1, WBTC: 2, BTCB: null, TONCOIN: 1.36 })).toEqual({
      BTC: 2,
      TON: 1.36,
    });
  });

  for (const fn of FNS) {
    it(`${fn.name}: alias trùng (BTC+BTCB+WBTC+BNB+WBNB) cho kết quả giống no-arg`, () => {
      expect(fn.totalUsd(REAL_AGGS, ALIAS_MAP)).toBeCloseTo(fn.totalUsd(REAL_AGGS), 6);
    });

    it(`${fn.name}: null và {} cho kết quả giống hệt`, () => {
      expect(fn.totalUsd(REAL_AGGS, null)).toBeCloseTo(fn.totalUsd(REAL_AGGS, {}), 6);
    });

    it(`${fn.name}: TON/TONCOIN dùng giá SSOT $1.36, không bịa $5 và không bỏ sót = 0`, () => {
      const ton = fn.totalUsd([{ symbol: 'TONCOIN', amount: 2, rows: 1 }]);
      expect(ton).toBeCloseTo(2 * 1.36, 6);
      expect(ton).not.toBe(0);
      expect(ton).not.toBeCloseTo(10, 6);
    });

    it(`${fn.name}: không còn literal fallback hardcode`, () => {
      const src = fn.src + priceAggs.toString() + normalizePriceMap.toString();
      for (const lit of ['100000', '0.000014', '700', '3500', '5.0']) {
        expect(src.includes(lit)).toBe(false);
      }
    });
  }
});
