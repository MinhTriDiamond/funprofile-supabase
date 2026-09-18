import { describe, it, expect } from 'vitest';
import { resolveDonationPrice, normalizePriceSymbol } from '@/lib/donationPriceValidation';

describe('normalizePriceSymbol (mirror public.normalize_price_symbol)', () => {
  it('alias TONCOIN → TON, WBNB → BNB, WBTC → BTC, còn lại giữ nguyên upper/trim', () => {
    expect(normalizePriceSymbol('toncoin')).toBe('TON');
    expect(normalizePriceSymbol(' WBNB ')).toBe('BNB');
    expect(normalizePriceSymbol('wbtc')).toBe('BTC');
    expect(normalizePriceSymbol('camly')).toBe('CAMLY');
    expect(normalizePriceSymbol(null)).toBe('');
  });
});

describe('donation price validation (mirror trigger enforce logic)', () => {
  it('không có giá đúng ngày nhưng có giá gần (7 ngày) → historical_nearby', () => {
    const r = resolveDonationPrice({ token_symbol: 'TONCOIN', amount: 1, historyPrice: null, nearbyPrice: 1.41578956 });
    expect(r.price_source).toBe('historical_nearby');
    expect(r.price_usd_at_donation).toBe(1.41578956);
    expect(r.amount_usd).toBe(1.41578956);
  });

  it('không có giá đúng ngày và cũng không có giá gần → pending', () => {
    const r = resolveDonationPrice({ token_symbol: 'ZZZTEST', amount: 5, historyPrice: null, nearbyPrice: null });
    expect(r.amount_usd).toBeNull();
    expect(r.price_source).toBe('pending');
  });

  it('không có token_price_history → amount_usd NULL + pending (không còn hardcode)', () => {
    const r = resolveDonationPrice({ token_symbol: 'BTC', amount: 0.01, historyPrice: null });
    expect(r.amount_usd).toBeNull();
    expect(r.price_source).toBe('pending');
    expect(r.auditLog).toBeNull();
  });

  it('có giá lịch sử → historical', () => {
    const r = resolveDonationPrice({ token_symbol: 'BTC', amount: 2, historyPrice: 80000 });
    expect(r.amount_usd).toBe(160000);
    expect(r.price_source).toBe('historical');
  });

  it('giá code truyền lệch > 2% → validation_failed + có audit log, donation vẫn lưu', () => {
    // code truyền giá BNB (617.87) cho BTC trong khi lịch sử 78655.35
    const r = resolveDonationPrice({
      token_symbol: 'BTC',
      amount: 1,
      amount_usd: 617.87,
      price_source: 'historical',
      historyPrice: 78655.35,
    });
    expect(r.amount_usd).toBeNull();
    expect(r.price_source).toBe('validation_failed');
    expect(r.auditLog).not.toBeNull();
    expect(r.auditLog!.history_price_usd).toBe(78655.35);
    expect(r.auditLog!.diff_pct).toBeGreaterThan(2);
  });

  it('giá code truyền đúng (lệch < 2%) → giữ nguyên', () => {
    const r = resolveDonationPrice({
      token_symbol: 'BTC',
      amount: 1,
      amount_usd: 79000,
      price_source: 'historical',
      historyPrice: 78655.35,
    });
    expect(r.amount_usd).toBe(79000);
    expect(r.price_source).toBe('historical');
    expect(r.auditLog).toBeNull();
  });

  it('không có giá lịch sử để đối chiếu → giữ nguyên giá code truyền, không gạt sang pending', () => {
    const r = resolveDonationPrice({
      token_symbol: 'USDT',
      amount: 2000,
      amount_usd: 2000,
      price_source: 'onchain',
      historyPrice: null,
    });
    expect(r.amount_usd).toBe(2000);
    expect(r.price_source).toBe('onchain');
    expect(r.auditLog).toBeNull();
  });

  it('FUN luôn testnet_skip', () => {
    const r = resolveDonationPrice({ token_symbol: 'FUN', amount: 100, historyPrice: 1 });
    expect(r.amount_usd).toBeNull();
    expect(r.price_source).toBe('testnet_skip');
  });
});
