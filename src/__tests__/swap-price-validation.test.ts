import { describe, it, expect } from 'vitest';
import {
  evaluateSwapLeg,
  applySwapPriceLogOnly,
  applySwapPriceEnforce,
  SWAP_PRICE_TOLERANCE_PCT,
} from '@/lib/swapPriceValidation';

describe('record-swap USD validation — GIAI ĐOẠN 1 (log-only)', () => {
  it('FUN là token testnet → testnet_skip, không so sánh giá', () => {
    const r = evaluateSwapLeg({ side: 'to', token_symbol: 'FUN', amount: 5000, code_amount_usd: 99.7, historyPrice: 1 });
    expect(r.verdict).toBe('testnet_skip');
    expect(r.diff_pct).toBeNull();
    expect(r.history_price_usd).toBeNull();
  });

  it('client khai USD lệch > 2% → would_fail (chỉ log, KHÔNG chặn)', () => {
    const r = evaluateSwapLeg({ side: 'from', token_symbol: 'BNB', amount: 1, code_amount_usd: 500, historyPrice: 700 });
    expect(r.verdict).toBe('would_fail');
    expect(r.diff_pct).toBeCloseTo(28.57, 1);
    expect(r.phase).toBe('log_only');
  });

  it('client khai USD lệch <= 2% → ok', () => {
    const r = evaluateSwapLeg({ side: 'from', token_symbol: 'BNB', amount: 2, code_amount_usd: 1414, historyPrice: 700 });
    expect(r.verdict).toBe('ok');
    expect(r.diff_pct!).toBeLessThanOrEqual(SWAP_PRICE_TOLERANCE_PCT);
  });

  it('không có giá lịch sử cùng ngày → no_history', () => {
    const r = evaluateSwapLeg({ side: 'to', token_symbol: 'CAMLY', amount: 1000, code_amount_usd: 0.014, historyPrice: null });
    expect(r.verdict).toBe('no_history');
  });

  it('client không khai USD → no_code_price / no_code_no_history', () => {
    expect(evaluateSwapLeg({ side: 'to', token_symbol: 'USDT', amount: 100, historyPrice: 1 }).verdict).toBe('no_code_price');
    expect(evaluateSwapLeg({ side: 'to', token_symbol: 'USDT', amount: 100, historyPrice: null }).verdict).toBe('no_code_no_history');
  });

  it('BẤT BIẾN: giai đoạn log-only KHÔNG đổi giá USD đang lưu', () => {
    const leg = { side: 'from' as const, token_symbol: 'BNB', amount: 1, code_amount_usd: 500, historyPrice: 700 };
    expect(evaluateSwapLeg(leg).verdict).toBe('would_fail');
    expect(applySwapPriceLogOnly(leg).amount_usd).toBe(500);
  });

  it('symbol viết thường vẫn được chuẩn hoá', () => {
    expect(evaluateSwapLeg({ side: 'from', token_symbol: 'fun', amount: 1 }).verdict).toBe('testnet_skip');
  });
});

describe('record-swap USD validation — GIAI ĐOẠN 2 (enforce, chưa bật)', () => {
  it('would_fail → bỏ giá client khai, verdict validation_failed', () => {
    const r = applySwapPriceEnforce({ side: 'from', token_symbol: 'BNB', amount: 1, code_amount_usd: 500, historyPrice: 700 });
    expect(r.amount_usd).toBeNull();
    expect(r.verdict).toBe('validation_failed');
  });

  it('ok → giữ nguyên giá client khai', () => {
    const r = applySwapPriceEnforce({ side: 'from', token_symbol: 'BNB', amount: 2, code_amount_usd: 1414, historyPrice: 700 });
    expect(r.amount_usd).toBe(1414);
    expect(r.verdict).toBe('ok');
  });

  it('không có giá lịch sử → giữ nguyên (không gạt sang null)', () => {
    const r = applySwapPriceEnforce({ side: 'to', token_symbol: 'CAMLY', amount: 1000, code_amount_usd: 0.014, historyPrice: null });
    expect(r.amount_usd).toBe(0.014);
    expect(r.verdict).toBe('no_history');
  });

  it('FUN vẫn testnet_skip, giữ giá client (nếu có)', () => {
    const r = applySwapPriceEnforce({ side: 'to', token_symbol: 'FUN', amount: 5000, code_amount_usd: null, historyPrice: null });
    expect(r.amount_usd).toBeNull();
    expect(r.verdict).toBe('testnet_skip');
  });
});
