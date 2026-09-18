import { describe, it, expect } from 'vitest';
import {
  validateSwapInput,
  toUnits,
  unitsToDecimal,
  decimalsFor,
} from '../../supabase/functions/record-swap/validateSwapInput';

const TX = '0x' + 'a'.repeat(64);
const base = { tx_hash: TX, chain_id: 56, from_symbol: 'USDT', to_symbol: 'CAMLY' };

const err = (r: ReturnType<typeof validateSwapInput>) => (r as { field: string }).field;

describe('record-swap — validate input', () => {
  it('nhận input hợp lệ và chuẩn hoá', () => {
    const r = validateSwapInput({
      ...base,
      tx_hash: TX.toUpperCase().replace('0X', '0x'),
      from_symbol: 'usdt',
      to_symbol: 'camly',
      from_amount: '1.500000000000000000',
      to_amount: '1000.5',
      from_amount_usd: 1.5,
      to_amount_usd: null,
      dex_provider: 'pancake',
      quote_id: 'q1',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.txHash).toBe(TX);
    expect(r.fromSymbol).toBe('USDT');
    expect(r.fromAmountUnits).toBe(1500000000000000000n);
    expect(r.toAmountUnits).toBe(1000500n); // CAMLY 3 decimals
    expect(r.fromAmount).toBe('1.5');
    expect(r.toAmountUsd).toBeNull();
    expect(r.dexProvider).toBe('pancake');
  });

  it('chặn tx_hash sai định dạng', () => {
    for (const tx of ['', '0x123', 'a'.repeat(66), null, 42]) {
      const r = validateSwapInput({ ...base, tx_hash: tx, from_amount: '1', to_amount: '1' });
      expect(r.ok).toBe(false);
      expect(err(r)).toBe('tx_hash');
    }
  });

  it('chặn chain không hỗ trợ', () => {
    const r = validateSwapInput({ ...base, chain_id: 1, from_amount: '1', to_amount: '1' });
    expect(r.ok).toBe(false);
    expect(err(r)).toBe('chain_id');
  });

  it('chặn symbol rỗng / trùng / ký tự lạ', () => {
    for (const [f, t] of [['', 'CAMLY'], ['USDT', 'USDT'], ['US DT', 'CAMLY'], ['A', 'CAMLY']]) {
      const r = validateSwapInput({ ...base, from_symbol: f, to_symbol: t, from_amount: '1', to_amount: '1' });
      expect(r.ok).toBe(false);
      expect(err(r)).toBe('symbols');
    }
  });

  it('chặn precision vượt decimals của token (CAMLY 3)', () => {
    const r = validateSwapInput({ ...base, from_amount: '1', to_amount: '1.2345' });
    expect(r.ok).toBe(false);
    expect(err(r)).toBe('to_amount');
  });

  it.each([
    ['ký hiệu khoa học', 1e21],
    ['số 0', '0'],
    ['số âm', '-1'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['chuỗi rác', 'abc'],
    ['null', null],
    ['object', { a: 1 }],
  ])('chặn from_amount không hợp lệ: %s', (_l, amount) => {
    const r = validateSwapInput({ ...base, from_amount: amount, to_amount: '1' });
    expect(r.ok).toBe(false);
    expect(err(r)).toBe('from_amount');
  });

  it('chặn số lượng vượt trần an toàn', () => {
    const r = validateSwapInput({ ...base, from_amount: '9'.repeat(20), to_amount: '1' });
    expect(r.ok).toBe(false);
  });

  it('chặn USD âm / quá 2 số thập phân / vượt trần', () => {
    for (const usd of [-1, '1.234', 2_000_000_000]) {
      const r = validateSwapInput({ ...base, from_amount: '1', to_amount: '1', from_amount_usd: usd });
      expect(r.ok).toBe(false);
      expect(err(r)).toBe('from_amount_usd');
    }
  });

  it('chặn dex_provider / quote_id quá dài', () => {
    expect(validateSwapInput({ ...base, from_amount: '1', to_amount: '1', dex_provider: 'x'.repeat(33) }).ok).toBe(false);
    expect(validateSwapInput({ ...base, from_amount: '1', to_amount: '1', quote_id: 'x'.repeat(65) }).ok).toBe(false);
  });

  it('chặn body không phải object', () => {
    expect(validateSwapInput(null).ok).toBe(false);
    expect(validateSwapInput([]).ok).toBe(false);
    expect(validateSwapInput('x').ok).toBe(false);
  });

  it('BigInt round-trip không mất precision', () => {
    const d = decimalsFor('FUN');
    const units = toUnits('123456789.123456789012345678', d)!;
    expect(unitsToDecimal(units, d)).toBe('123456789.123456789012345678');
  });
});
