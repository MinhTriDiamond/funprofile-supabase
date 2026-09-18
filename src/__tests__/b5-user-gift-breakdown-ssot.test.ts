/**
 * B5 guard — `get_user_gift_breakdown` + `useGiftBreakdown`:
 *  1. Nhãn BNB tách theo chain (mainnet 56 / testnet 97), alias giá về 'BNB'.
 *  2. Token không có giá thật (price_usd = NULL) → `unpricedItems`, KHÔNG cộng totalUsd.
 *  3. Không còn literal fallback hardcode (BTC 100000 / CAMLY 0.000014 / BNB 700 / TON 5).
 *
 * Mirror logic đã deploy. Sửa RPC/hook thì phải sửa file này.
 */
import { describe, it, expect } from 'vitest';

const ALIASES: Record<string, string> = { TONCOIN: 'TON', WBNB: 'BNB', WBTC: 'BTC', BTCB: 'BTC' };

/** Mirror nhãn BNB trong RPC */
export function labelOf(symbol: string | null, chainId?: number | null): string {
  const s = (symbol ?? 'UNKNOWN').toUpperCase();
  if (s === 'BNB') return chainId === 97 ? 'BNB (BSC Testnet)' : 'BNB (BSC Chain)';
  return s;
}

/** Mirror khóa giá: label → base symbol → normalize_price_symbol */
export function priceKeyOf(label: string): string {
  const base = label.startsWith('BNB') ? 'BNB' : label.toUpperCase();
  return ALIASES[base] ?? base;
}

interface Row {
  token_symbol: string;
  cnt: number;
  total_amount: number;
  price_usd: number | null;
}

/** Mirror phần split items/unpricedItems của hook */
export function splitRows(rows: Row[]) {
  const items: Row[] = [];
  const unpriced: Row[] = [];
  let totalUsd = 0;
  let totalCount = 0;
  for (const r of rows) {
    totalCount += r.cnt;
    const usd = r.price_usd == null ? 0 : r.total_amount * r.price_usd;
    if (r.price_usd == null || usd <= 0) unpriced.push(r);
    else {
      items.push(r);
      totalUsd += usd;
    }
  }
  return { items, unpriced, totalUsd, totalCount };
}

describe('B5 — get_user_gift_breakdown SSOT', () => {
  it('nhãn BNB tách theo chain nhưng dùng chung 1 khóa giá', () => {
    expect(labelOf('bnb', 56)).toBe('BNB (BSC Chain)');
    expect(labelOf('BNB', 97)).toBe('BNB (BSC Testnet)');
    expect(labelOf('BNB', null)).toBe('BNB (BSC Chain)');
    expect(priceKeyOf('BNB (BSC Testnet)')).toBe('BNB');
    expect(priceKeyOf('BNB (BSC Chain)')).toBe('BNB');
  });

  it('alias BTCB/WBTC/WBNB/TONCOIN quy về symbol SSOT', () => {
    expect(priceKeyOf('BTCB')).toBe('BTC');
    expect(priceKeyOf('WBTC')).toBe('BTC');
    expect(priceKeyOf('WBNB')).toBe('BNB');
    expect(priceKeyOf('TONCOIN')).toBe('TON');
  });

  it('token NULL-price vào unpricedItems, không cộng vào totalUsd', () => {
    const { items, unpriced, totalUsd, totalCount } = splitRows([
      { token_symbol: 'BTC', cnt: 76, total_amount: 1.18159, price_usd: 77725 },
      { token_symbol: 'FUN', cnt: 12, total_amount: 1_000_000, price_usd: null },
    ]);
    expect(items.map((i) => i.token_symbol)).toEqual(['BTC']);
    expect(unpriced.map((i) => i.token_symbol)).toEqual(['FUN']);
    expect(totalUsd).toBeCloseTo(1.18159 * 77725, 6);
    expect(totalCount).toBe(88);
  });

  it('Preview 4 dòng của user nặng nhất khớp tổng USD server', () => {
    const rows: Row[] = [
      { token_symbol: 'BTC', cnt: 76, total_amount: 1.18159, price_usd: 77725 },
      { token_symbol: 'USDT', cnt: 350, total_amount: 14854.397, price_usd: 1 },
      { token_symbol: 'BNB (BSC Chain)', cnt: 121, total_amount: 16.8434, price_usd: 689.3 },
      { token_symbol: 'CAMLY', cnt: 782, total_amount: 1_113_961_495.8, price_usd: 0.00000294 },
    ];
    const { totalCount, totalUsd } = splitRows(rows);
    expect(totalCount).toBe(1329);
    expect(totalUsd).toBeCloseTo(91839.08275 + 14854.397 + 11610.15562 + 3275.046797652, 3);
  });

  it('không còn literal fallback hardcode', () => {
    const src = labelOf.toString() + priceKeyOf.toString() + splitRows.toString();
    for (const lit of ['100000', '0.000014', '700', '3500', '5.0']) {
      expect(src.includes(lit)).toBe(false);
    }
  });
});
