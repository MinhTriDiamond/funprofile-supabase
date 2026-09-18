import { describe, it, expect } from 'vitest';
import { compareClaimWallet } from '../../supabase/functions/claim-reward/walletMatch';
import { isClaimWalletMismatch, normalizeWallet } from '@/lib/claimWalletMismatch';

const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);

describe('claim-reward — đối chiếu ví (edge)', () => {
  it('khớp ví: matches=true, flag=match', () => {
    const r = compareClaimWallet(A, A);
    expect(r.matches).toBe(true);
    expect(r.flag).toBe('match');
    expect(r.unknownRegistered).toBe(false);
  });

  it('khớp ví dù khác hoa/thường (checksum address)', () => {
    const r = compareClaimWallet(A, A.toUpperCase().replace('0X', '0x'));
    expect(r.matches).toBe(true);
    expect(r.registered).toBe(A);
    expect(r.requested).toBe(A);
  });

  it('lệch ví: matches=false, flag=mismatch — KHÔNG chặn cứng', () => {
    const r = compareClaimWallet(B, A);
    expect(r.matches).toBe(false);
    expect(r.flag).toBe('mismatch');
    expect(r.registered).toBe(A);
    expect(r.requested).toBe(B);
  });

  it('profile chưa có ví đăng ký hợp lệ ⇒ flag=no_registered_wallet', () => {
    for (const bad of [null, undefined, '', '0x123', 'abc']) {
      const r = compareClaimWallet(A, bad as string | null);
      expect(r.flag).toBe('no_registered_wallet');
      expect(r.unknownRegistered).toBe(true);
      expect(r.registered).toBeNull();
    }
  });
});

describe('UI admin — cờ cảnh báo lệch ví', () => {
  it('khớp ví ⇒ không cảnh báo', () => {
    expect(isClaimWalletMismatch(A, A)).toBe(false);
    expect(isClaimWalletMismatch(A.toUpperCase().replace('0X', '0x'), A)).toBe(false);
  });

  it('lệch ví ⇒ cảnh báo', () => {
    expect(isClaimWalletMismatch(B, A)).toBe(true);
  });

  it('thiếu ví đăng ký hoặc ví yêu cầu không hợp lệ ⇒ cảnh báo', () => {
    expect(isClaimWalletMismatch(A, null)).toBe(true);
    expect(isClaimWalletMismatch(A, '0x123')).toBe(true);
    expect(isClaimWalletMismatch('0x123', A)).toBe(true);
  });

  it('normalizeWallet luôn lowercase hoặc null', () => {
    expect(normalizeWallet('0x' + 'A'.repeat(40))).toBe('0x' + 'a'.repeat(40));
    expect(normalizeWallet('nope')).toBeNull();
  });

  it('FE và edge cho cùng kết luận', () => {
    const cases: Array<[string, string | null]> = [[A, A], [B, A], [A, null], [A, '0x123']];
    for (const [req, reg] of cases) {
      expect(isClaimWalletMismatch(req, reg)).toBe(!compareClaimWallet(req, reg).matches);
    }
  });
});
