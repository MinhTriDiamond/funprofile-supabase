/**
 * B3-02 Lớp 2 + B3-04 + B3-03 — Vitest guard
 *
 * 1. Reserve nguyên tử: 2 request đồng thời cùng action → chỉ 1 thành công khi tổng vượt cap.
 * 2. B3-04: đường admin submit trực tiếp cũng phải reserve trước writeContractAsync.
 * 3. B3-03: sửa bài sau khi đã chấm → điểm/eligibility giữ nguyên.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const CAP_WEI = 950000n * 10n ** 18n;

/** Mô phỏng RPC pplp_reserve_daily_mint: row-lock tuần tự hoá, cap không thể vượt. */
function makeCapLedger() {
  const state = new Map<string, bigint>();
  const queue: Array<() => void> = [];
  let busy = false;

  const runExclusive = async <T>(fn: () => T): Promise<T> => {
    if (busy) await new Promise<void>((r) => queue.push(r));
    busy = true;
    try {
      return fn();
    } finally {
      busy = false;
      queue.shift()?.();
    }
  };

  return {
    reserve: (action: string, amount: bigint) =>
      runExclusive(() => {
        const used = state.get(action) ?? 0n;
        if (used + amount > CAP_WEI) {
          return { ok: false, reason: 'DAILY_CAP_EXCEEDED', remaining_wei: (CAP_WEI - used).toString() };
        }
        state.set(action, used + amount);
        return { ok: true, reserved_wei: (used + amount).toString() };
      }),
    release: (action: string, amount: bigint) =>
      runExclusive(() => {
        const used = state.get(action) ?? 0n;
        state.set(action, used > amount ? used - amount : 0n);
        return { ok: true };
      }),
    used: (action: string) => state.get(action) ?? 0n,
  };
}

describe('B3-02 Lớp 2 — reserve cap nguyên tử', () => {
  it('2 request đồng thời cùng action: chỉ 1 reserve thành công khi tổng vượt cap', async () => {
    const ledger = makeCapLedger();
    const half = 600000n * 10n ** 18n; // 2 × 600k = 1.2M > 950k

    const [a, b] = await Promise.all([
      ledger.reserve('GRATITUDE', half),
      ledger.reserve('GRATITUDE', half),
    ]);

    const okCount = [a, b].filter((r) => r.ok).length;
    expect(okCount).toBe(1);
    expect(ledger.used('GRATITUDE')).toBe(half);
    const rejected = [a, b].find((r) => !r.ok)!;
    expect(rejected.reason).toBe('DAILY_CAP_EXCEEDED');
  });

  it('release khi tx revert → cap được hoàn lại, không khoá oan', async () => {
    const ledger = makeCapLedger();
    const amount = 900000n * 10n ** 18n;

    expect((await ledger.reserve('SERVICE', amount)).ok).toBe(true);
    expect((await ledger.reserve('SERVICE', amount)).ok).toBe(false); // đã gần cap
    await ledger.release('SERVICE', amount); // tx revert
    expect(ledger.used('SERVICE')).toBe(0n);
    expect((await ledger.reserve('SERVICE', amount)).ok).toBe(true);
  });

  it('action khác nhau có cap độc lập', async () => {
    const ledger = makeCapLedger();
    const amount = 900000n * 10n ** 18n;
    expect((await ledger.reserve('GIVING', amount)).ok).toBe(true);
    expect((await ledger.reserve('HELPING', amount)).ok).toBe(true);
  });
});

describe('B3-04 — admin submit trực tiếp phải qua reserve', () => {
  const src = read('src/hooks/usePplpAdmin.ts');

  it('gọi pplp_reserve_daily_mint TRƯỚC writeContractAsync', () => {
    const reserveIdx = src.indexOf("pplp_reserve_daily_mint");
    const writeIdx = src.indexOf('writeContractAsync({');
    expect(reserveIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(-1);
    expect(reserveIdx).toBeLessThan(writeIdx);
  });

  it('chặn submit khi vượt cap (return null, không gọi contract)', () => {
    expect(src).toMatch(/if \(!reserveInfo\?\.ok\)[\s\S]{0,400}return null;/);
  });

  it('release cap khi tx revert hoặc write lỗi', () => {
    expect(src).toContain('pplp_release_daily_mint');
    expect(src).toMatch(/catch \(writeErr\)[\s\S]{0,120}releaseCap\(\)/);
    expect(src).toMatch(/reverted on-chain[\s\S]{0,400}/);
    expect(src).toContain('await releaseCap();');
  });

  it('amount truyền dạng string BigInt (không mất precision)', () => {
    expect(src).toContain('BigInt(request.amount_wei).toString()');
  });
});

describe('B3-02 Lớp 2 — pplp-auto-submit dùng reserve thay vì tự cộng', () => {
  const src = read('supabase/functions/pplp-auto-submit/index.ts');

  it('gọi reserve trước mọi call on-chain', () => {
    const reserveIdx = src.indexOf('pplp_reserve_daily_mint');
    const writeIdx = src.indexOf('walletClient.writeContract');
    expect(reserveIdx).toBeGreaterThan(-1);
    expect(reserveIdx).toBeLessThan(writeIdx);
  });

  it('throttle khi reserve trả ok=false, không tốn gas', () => {
    expect(src).toMatch(/reserveRes as any\)\.ok !== true[\s\S]{0,600}continue;/);
  });

  it('release khi revert / exception', () => {
    expect(src).toContain('pplp_release_daily_mint');
    expect(src).toMatch(/reverted on-chain[\s\S]{0,200}/);
    // 2 điểm gọi release: nhánh revert + nhánh catch exception
    expect((src.match(/await releaseReservation\(\);/g) || []).length).toBe(2);
  });
});

describe('B3-03 — khoá điểm tại lần chấm đầu', () => {
  /** Mô phỏng trigger posts_lock_score_on_edit */
  function applyUpdate(
    old: { content: string; is_reward_eligible: boolean | null; scored_at: string | null; scored_content_hash: string | null },
    next: { content?: string; is_reward_eligible?: boolean | null },
  ) {
    const row = { ...old, ...next };
    const hash = (s: string) => `md5:${s.length}:${s.slice(0, 8)}`;
    const log: Array<{ old_hash: string; new_hash: string }> = [];

    if (row.scored_at === null && row.is_reward_eligible !== null) {
      row.scored_at = '2026-08-19T00:00:00Z';
      row.scored_content_hash = hash(row.content);
      return { row, log };
    }
    if (old.scored_at !== null) {
      row.is_reward_eligible = old.is_reward_eligible;
      row.scored_at = old.scored_at;
      row.scored_content_hash = old.scored_content_hash;
      if (hash(row.content) !== hash(old.content)) {
        log.push({ old_hash: hash(old.content), new_hash: hash(row.content) });
      }
    }
    return { row, log };
  }

  const longPost = 'A'.repeat(120);

  it('lần chấm đầu đóng dấu scored_at + scored_content_hash', () => {
    const { row } = applyUpdate(
      { content: longPost, is_reward_eligible: null, scored_at: null, scored_content_hash: null },
      { is_reward_eligible: true },
    );
    expect(row.scored_at).not.toBeNull();
    expect(row.scored_content_hash).not.toBeNull();
    expect(row.is_reward_eligible).toBe(true);
  });

  it('sửa bài sau khi đã chấm → eligibility giữ nguyên', () => {
    const scored = { content: longPost, is_reward_eligible: true, scored_at: '2026-08-19T00:00:00Z', scored_content_hash: 'md5:120:AAAAAAAA' };
    const { row } = applyUpdate(scored, { content: 'ngắn' });
    expect(row.is_reward_eligible).toBe(true);
    expect(row.scored_at).toBe(scored.scored_at);
    expect(row.scored_content_hash).toBe(scored.scored_content_hash);
  });

  it('user không thể tự bật eligibility sau khi đã chấm false', () => {
    const scored = { content: longPost, is_reward_eligible: false, scored_at: '2026-08-19T00:00:00Z', scored_content_hash: 'h' };
    const { row } = applyUpdate(scored, { is_reward_eligible: true, content: longPost });
    expect(row.is_reward_eligible).toBe(false);
  });

  it('mỗi lần sửa nội dung sau chấm được ghi log giám sát', () => {
    const scored = { content: longPost, is_reward_eligible: true, scored_at: '2026-08-19T00:00:00Z', scored_content_hash: 'h' };
    const { log } = applyUpdate(scored, { content: 'nội dung mới hoàn toàn' });
    expect(log).toHaveLength(1);
  });

  it('sửa field khác (không đổi content) không ghi log', () => {
    const scored = { content: longPost, is_reward_eligible: true, scored_at: '2026-08-19T00:00:00Z', scored_content_hash: 'h' };
    const { log } = applyUpdate(scored, {});
    expect(log).toHaveLength(0);
  });
});
