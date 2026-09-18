/**
 * B2 guard test — get_app_stats dùng SSOT giá (token_price_current),
 * không còn bảng giá hardcode.
 *
 * Mirror logic đã deploy (migration 20260829 B2). Nếu sửa RPC, phải sửa file này.
 */
import { describe, it, expect } from 'vitest';

const SYMBOL_ALIASES: Record<string, string> = {
  TONCOIN: 'TON',
  WBNB: 'BNB',
  WBTC: 'BTC',
};

function normalizePriceSymbol(symbol: string): string {
  const s = (symbol ?? '').trim().toUpperCase();
  return SYMBOL_ALIASES[s] ?? s;
}

interface Agg {
  symbol: string;
  amount: number;
  rows: number;
}

interface StatsResult {
  total_usd: number;
  unpriced_symbols: string[];
  skipped_symbols: string[];
  priced_coverage_pct: number;
}

/** Mirror của get_app_stats(p_prices) — phần tính USD */
export function computeAppStatsUsd(
  aggs: Agg[],
  ssot: Record<string, number>,
  externalPrices: Record<string, number | null> | null = null,
): StatsResult {
  // FIX hotfix 2026-08-29: dedupe theo symbol đã normalize (BTC/WBTC/BTCB → BTC)
  // để alias trùng không nhân đôi giá trị token trong tổng USD.
  const ext: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(externalPrices ?? {})) {
    if (v == null) continue;
    const sym = normalizePriceSymbol(k);
    ext[sym] = ext[sym] == null ? v : Math.max(ext[sym] as number, v);
  }


  let total = 0;
  let rowsTotal = 0;
  let rowsPriced = 0;
  const unpriced = new Set<string>();
  const skipped = new Set<string>();

  for (const a of aggs) {
    const sym = normalizePriceSymbol(a.symbol);
    const price = ext[sym] ?? ssot[sym] ?? null;
    rowsTotal += a.rows;
    if (sym === 'FUN') {
      skipped.add(sym);
      rowsPriced += a.rows;
      continue;
    }
    if (price == null) {
      unpriced.add(sym);
      continue;
    }
    rowsPriced += a.rows;
    total += a.amount * price;
  }

  return {
    total_usd: total,
    unpriced_symbols: [...unpriced].sort(),
    skipped_symbols: [...skipped],
    priced_coverage_pct:
      rowsTotal > 0 ? Math.round((rowsPriced / rowsTotal) * 10000) / 100 : 100,
  };
}

const SSOT = { BTC: 77673, BTCB: 77673, BNB: 688.9, USDT: 0.999982, CAMLY: 0.00000296, TON: 1.36 };

describe('B2 — get_app_stats SSOT', () => {
  it('case 1: không truyền giá ngoài = truyền null (kết quả giống hệt)', () => {
    const aggs: Agg[] = [{ symbol: 'BNB', amount: 10, rows: 5 }];
    expect(computeAppStatsUsd(aggs, SSOT)).toEqual(computeAppStatsUsd(aggs, SSOT, null));
  });

  it('case 2: symbol lạ vào unpriced_symbols, KHÔNG âm thầm cộng 0 như đã định giá', () => {
    const r = computeAppStatsUsd(
      [
        { symbol: 'BNB', amount: 10, rows: 9 },
        { symbol: 'ZZZB2TEST', amount: 1, rows: 1 },
      ],
      SSOT,
    );
    expect(r.unpriced_symbols).toEqual(['ZZZB2TEST']);
    expect(r.total_usd).toBeCloseTo(6889, 6);
    expect(r.priced_coverage_pct).toBe(90);
  });

  it('case 3: FUN là skipped (testnet), không phải unpriced', () => {
    const r = computeAppStatsUsd(
      [
        { symbol: 'FUN', amount: 1000, rows: 4 },
        { symbol: 'BNB', amount: 1, rows: 1 },
      ],
      SSOT,
    );
    expect(r.skipped_symbols).toEqual(['FUN']);
    expect(r.unpriced_symbols).toEqual([]);
    expect(r.priced_coverage_pct).toBe(100);
  });

  it('alias TONCOIN → TON dùng chung normalize_price_symbol', () => {
    const r = computeAppStatsUsd([{ symbol: 'TONCOIN', amount: 2, rows: 1 }], SSOT);
    expect(r.unpriced_symbols).toEqual([]);
    expect(r.total_usd).toBeCloseTo(2.72, 6);
  });

  it('giá ngoài (p_prices) ưu tiên hơn SSOT', () => {
    const r = computeAppStatsUsd([{ symbol: 'CAMLY', amount: 1_000_000, rows: 1 }], SSOT, {
      CAMLY: 0.00001,
    });
    expect(r.total_usd).toBeCloseTo(10, 6);
  });

  it('hotfix: alias trùng (BTC+WBTC+BTCB) phải cho kết quả GIỐNG HỆT no-arg', () => {
    const aggs: Agg[] = [
      { symbol: 'BTC', amount: 15.76136027, rows: 124 },
      { symbol: 'BNB', amount: 135.881227, rows: 1737 },
      { symbol: 'CAMLY', amount: 31_653_567_402.76, rows: 21675 },
    ];
    const noArg = computeAppStatsUsd(aggs, SSOT);
    const withAliases = computeAppStatsUsd(aggs, SSOT, {
      BTC: SSOT.BTC,
      WBTC: SSOT.BTC,
      BTCB: SSOT.BTC,
      BNB: SSOT.BNB,
      WBNB: SSOT.BNB,
      CAMLY: SSOT.CAMLY,
    });
    expect(withAliases.total_usd).toBeCloseTo(noArg.total_usd, 6);
    expect(withAliases.priced_coverage_pct).toBe(noArg.priced_coverage_pct);
  });

  it('không còn giá hardcode cũ trong mirror (95000/100000/0.000014/0.001)', () => {
    const src = computeAppStatsUsd.toString() + normalizePriceSymbol.toString();
    for (const lit of ['95000', '100000', '0.000014', '0.001']) {
      expect(src.includes(lit)).toBe(false);
    }
  });
});

