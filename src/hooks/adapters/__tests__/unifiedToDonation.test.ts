/**
 * Batch 2.3.1 — Unit tests cho adapter `unifiedRowToDonationRecord`.
 *
 * Assert từng field shape khớp legacy `DonationRecord` cho 6 fixture:
 *   1. FUN donation OUT
 *   2. CAMLY donation IN
 *   3. Swap FUN→USDT (dual-amount qua metadata)
 *   4. Transfer BNB IN (external wallet)
 *   5. BTC IN (native, aux address resolved)
 *   6. BTC IN (external, không match user)
 */
import { describe, it, expect } from 'vitest';
import { unifiedRowToDonationRecord } from '../unifiedToDonation';
import type { UnifiedTransactionRow } from '@/components/transactions/types';

const TARGET = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function base(overrides: Partial<UnifiedTransactionRow>): UnifiedTransactionRow {
  return {
    id: 'u-1',
    user_id: TARGET,
    counterparty_user_id: null,
    source_table: 'donations',
    source_id: 'd-1',
    tx_hash: '0xhash',
    direction: 'out',
    direction_confidence: 'exact',
    tx_type: 'donation',
    status: 'success',
    chain: 'bsc',
    chain_id: 56,
    network: 'mainnet',
    token_symbol: 'FUN',
    token_address: null,
    decimals: 18,
    amount_raw: null,
    amount_decimal: 100,
    fee_raw: null,
    sender_address: null,
    recipient_address: null,
    block_number: null,
    is_external: false,
    memo: null,
    metadata: null,
    occurred_at: '2026-07-01T00:00:00Z',
    confirmed_at: '2026-07-01T00:00:00Z',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('unifiedRowToDonationRecord', () => {
  it('1) FUN donation OUT — sender_id là target, type=donation', () => {
    const r = unifiedRowToDonationRecord(
      base({
        direction: 'out',
        sender_user_id: TARGET,
        recipient_user_id: OTHER,
        recipient_username: 'other',
        recipient_display_name: 'Other',
      }),
      { targetUserId: TARGET },
    );
    expect(r.type).toBe('donation');
    expect(r.token_symbol).toBe('FUN');
    expect(r.amount).toBe('100');
    expect(r.sender_id).toBe(TARGET);
    expect(r.recipient_id).toBe(OTHER);
    expect(r.recipient_username).toBe('other');
    expect(r.direction).toBe('out');
  });

  it('2) CAMLY donation IN — recipient_id là target', () => {
    const r = unifiedRowToDonationRecord(
      base({
        direction: 'in',
        token_symbol: 'CAMLY',
        amount_decimal: 5000,
        sender_user_id: OTHER,
        recipient_user_id: TARGET,
        sender_username: 'giver',
      }),
      { targetUserId: TARGET },
    );
    expect(r.token_symbol).toBe('CAMLY');
    expect(r.sender_id).toBe(OTHER);
    expect(r.recipient_id).toBe(TARGET);
    expect(r.direction).toBe('in');
    expect(r.sender_username).toBe('giver');
  });

  it('3) Swap FUN→USDT — dual-amount từ metadata.pair_symbol/pair_amount', () => {
    const r = unifiedRowToDonationRecord(
      base({
        source_table: 'swap_transactions',
        tx_type: 'swap',
        direction: 'out',
        token_symbol: 'FUN',
        amount_decimal: 1000,
        metadata: { pair_symbol: 'USDT', pair_amount: 12.34 },
      }),
      { targetUserId: TARGET },
    );
    expect(r.type).toBe('swap');
    expect(r.from_symbol).toBe('FUN');
    expect(r.from_amount).toBe(1000);
    expect(r.to_symbol).toBe('USDT');
    expect(r.to_amount).toBe(12.34);
  });

  it('4) Transfer BNB IN (external wallet)', () => {
    const r = unifiedRowToDonationRecord(
      base({
        source_table: 'wallet_transfers',
        tx_type: 'transfer',
        direction: 'in',
        token_symbol: 'BNB',
        amount_decimal: 0.5,
        is_external: true,
        sender_address: '0xabc',
        recipient_address: '0xtarget',
      }),
      { targetUserId: TARGET },
    );
    expect(r.type).toBe('transfer');
    expect(r.direction).toBe('in');
    expect(r.is_external).toBe(true);
    expect(r.counterparty_address).toBe('0xabc');
  });

  it('5) BTC IN native — aux address đã resolve về user, counterparty_user_id có sender profile', () => {
    const r = unifiedRowToDonationRecord(
      base({
        source_table: 'wallet_transfers',
        tx_type: 'transfer',
        direction: 'in',
        chain: 'btc',
        chain_id: 0,
        token_symbol: 'BTC',
        amount_decimal: 0.00123,
        sender_user_id: OTHER,
        sender_username: 'btc-giver',
        sender_display_name: 'BTC Giver',
        sender_address: 'bc1qxxxxxx',
        recipient_address: 'bc1qtarget',
      }),
      { targetUserId: TARGET },
    );
    expect(r.type).toBe('transfer');
    expect(r.token_symbol).toBe('BTC');
    expect(r.sender_id).toBe(OTHER);
    expect(r.sender_username).toBe('btc-giver');
    expect(r.counterparty_address).toBe('bc1qxxxxxx');
  });

  it('6) BTC IN external — không match user, sender_id null, is_external=true', () => {
    const r = unifiedRowToDonationRecord(
      base({
        source_table: 'wallet_transfers',
        tx_type: 'transfer',
        direction: 'in',
        chain: 'btc',
        chain_id: 0,
        token_symbol: 'BTC',
        amount_decimal: 0.02,
        sender_user_id: null,
        counterparty_user_id: null,
        is_external: true,
        sender_address: 'bc1qunknown',
      }),
      { targetUserId: TARGET },
    );
    expect(r.type).toBe('transfer');
    expect(r.sender_id).toBeNull();
    expect(r.is_external).toBe(true);
    expect(r.counterparty_address).toBe('bc1qunknown');
  });
});
