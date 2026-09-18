import { describe, it, expect } from 'vitest';
import {
  validateClaimInput,
  decimalToUnits,
  unitsToDecimal,
  CAMLY_DECIMALS,
} from '../../supabase/functions/claim-reward/validateClaimInput';

describe('claim-reward — validate input (P1, mục 4 Batch 2)', () => {
  it('chấp nhận input hợp lệ và lowercase địa chỉ ví', () => {
    const r = validateClaimInput({
      wallet_address: '0xF0DDF84D01E51A4192CEE973BC12644D7F834EBF',
      amount: '200000',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.walletAddress).toBe('0xf0ddf84d01e51a4192cee973bc12644d7f834ebf');
    expect(r.amountUnits).toBe(200000000n); // 200000 * 10^3
    expect(r.amountDecimal).toBe('200000');
  });

  it('giữ đúng 3 số thập phân của CAMLY, không mất precision', () => {
    const r = validateClaimInput({
      wallet_address: '0x' + 'a'.repeat(40),
      amount: '200000.123',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amountUnits).toBe(200000123n);
    expect(r.amountDecimal).toBe('200000.123');
  });

  it('chặn quá 3 số thập phân', () => {
    const r = validateClaimInput({ wallet_address: '0x' + 'b'.repeat(40), amount: '1.2345' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as { field: string }).field).toBe('amount');
  });

  it.each([
    ['chuỗi rỗng', ''],
    ['không phải số', 'abc'],
    ['ký hiệu khoa học', '1e21'],
    ['số âm', '-100'],
    ['số 0', '0'],
    ['Infinity', Infinity],
    ['NaN', NaN],
    ['null', null],
    ['object', { a: 1 }],
  ])('chặn amount không hợp lệ: %s', (_label, amount) => {
    const r = validateClaimInput({ wallet_address: '0x' + 'c'.repeat(40), amount });
    expect(r.ok).toBe(false);
  });

  it('chặn số cực lớn vượt trần an toàn', () => {
    const r = validateClaimInput({
      wallet_address: '0x' + 'd'.repeat(40),
      amount: '99999999999999999999',
    });
    expect(r.ok).toBe(false);
  });

  it.each([
    ['thiếu ví', { amount: '200000' }],
    ['ví rỗng', { wallet_address: '   ', amount: '200000' }],
    ['ví thiếu ký tự', { wallet_address: '0x123', amount: '200000' }],
    ['ví có ký tự lạ', { wallet_address: '0x' + 'z'.repeat(40), amount: '200000' }],
    ['ví là số', { wallet_address: 12345, amount: '200000' }],
  ])('chặn wallet_address không hợp lệ: %s', (_label, body) => {
    const r = validateClaimInput(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as { field: string }).field).toBe('wallet_address');
  });

  it('chặn body không phải object', () => {
    expect(validateClaimInput(null).ok).toBe(false);
    expect(validateClaimInput('x').ok).toBe(false);
    expect(validateClaimInput([]).ok).toBe(false);
  });

  it('BigInt math round-trip không mất precision', () => {
    const cases = ['0.001', '1', '500000', '123456.789', '999999999.999'];
    for (const c of cases) {
      const units = decimalToUnits(c, CAMLY_DECIMALS);
      expect(units).not.toBeNull();
      expect(unitsToDecimal(units as bigint, CAMLY_DECIMALS)).toBe(c);
    }
  });

  it('không dùng Number() cho amount trong edge function', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('supabase/functions/claim-reward/index.ts', 'utf8');
    expect(src).not.toMatch(/const claimAmount = Number\(amount\)/);
    expect(src).toContain('validateClaimInput');
  });
});
