import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const edgeSrc = readFileSync(
  resolve(__dirname, '../../supabase/functions/treasury-overview/index.ts'),
  'utf-8',
);
const hookSrc = readFileSync(
  resolve(__dirname, '../hooks/useBenefactorLeaderboard.ts'),
  'utf-8',
);

describe('B6 — Treasury overview tính SQL-side + hook bỏ reduce cross-token', () => {
  // (a) Tổng inflow đã chốt ở #5 — hằng số neo cho verify runtime
  it('a) hằng số đối soát #5 nhất quán', () => {
    const petShop = 22_444_000;
    const mysteryBox = 8_707_000;
    expect(petShop + mysteryBox).toBe(31_151_000);
  });

  // (b) Edge function không còn tự SUM ở JS
  it('b) edge function không còn sumOrders/.select("price_camly")/.reduce(', () => {
    expect(edgeSrc).not.toMatch(/function sumOrders/);
    expect(edgeSrc).not.toMatch(/price_camly/);
    expect(edgeSrc).not.toMatch(/\.reduce\(/);
  });

  // (c) Edge function dùng đúng 1 RPC tổng hợp
  it('c) gọi get_treasury_camly_overview và giữ response shape', () => {
    expect(edgeSrc).toContain('admin.rpc("get_treasury_camly_overview")');
    expect((edgeSrc.match(/get_treasury_camly_overview/g) || []).length).toBe(1);
    for (const key of [
      'treasury_address',
      'onchain_camly',
      'inflows',
      'outflows',
      'ledger',
      'token_symbol',
      'vaults',
      'top_spenders',
      'fetched_at',
    ]) {
      expect(edgeSrc).toContain(`${key}:`);
    }
    expect(edgeSrc).toContain('pet_shop');
    expect(edgeSrc).toContain('mystery_box');
  });

  // (d) Hook không còn cộng amount của nhiều token khác nhau
  it('d) useBenefactorLeaderboard không còn reduce cross-token', () => {
    expect(hookSrc).not.toMatch(/total_donated:/);
    expect(hookSrc).not.toMatch(/total_received:\s*Object\.values/);
    expect(hookSrc).not.toMatch(/item\.amount/);
    expect(hookSrc).toContain('total_donated_usd');
    expect(hookSrc).toContain('total_received_usd');
  });
});
