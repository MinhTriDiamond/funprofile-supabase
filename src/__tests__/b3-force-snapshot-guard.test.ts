/**
 * B3-05 (3.3) — force_snapshot phải:
 *  1. Chỉ cho admin JWT dùng (cron/service-role bị 403 FORCE_SNAPSHOT_ADMIN_ONLY)
 *  2. Khi bypass thật sự → ghi cờ guard_bypassed + guard_report vào mint_epochs
 *
 * B3-02 Lớp 1 — pplp-auto-submit phải xin lease trước khi submit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const snapshotSrc = readFileSync(
  resolve(process.cwd(), 'supabase/functions/pplp-epoch-snapshot/index.ts'),
  'utf-8',
);
const autoSubmitSrc = readFileSync(
  resolve(process.cwd(), 'supabase/functions/pplp-auto-submit/index.ts'),
  'utf-8',
);

describe('force_snapshot admin guard', () => {
  it('chặn force_snapshot khi không có admin JWT', () => {
    expect(snapshotSrc).toContain('FORCE_SNAPSHOT_ADMIN_ONLY');
    expect(snapshotSrc).toMatch(/if \(forceRequested && !adminUserId\)/);
    expect(snapshotSrc).toMatch(/forceSnapshot = forceRequested && !!adminUserId/);
  });

  it('chỉ set adminUserId sau khi xác thực role admin', () => {
    const idx = snapshotSrc.indexOf('adminUserId = user.id');
    expect(idx).toBeGreaterThan(-1);
    const before = snapshotSrc.slice(0, idx);
    expect(before).toContain("Admin role required");
  });

  it('ghi dấu epoch đã bypass guard', () => {
    expect(snapshotSrc).toContain('guard_bypassed: guardBypassed');
    expect(snapshotSrc).toContain('guard_report: guardReport');
    expect(snapshotSrc).toContain('guard_bypassed_by');
    expect(snapshotSrc).toContain('guard_bypassed_at');
    expect(snapshotSrc).toContain('epoch.snapshot.guard_bypassed');
  });
});

describe('pplp-auto-submit single-flight lease', () => {
  it('xin lease trước khi lấy request để submit', () => {
    const leaseIdx = autoSubmitSrc.indexOf("job_acquire_lease");
    const fetchIdx = autoSubmitSrc.indexOf("from('pplp_mint_requests')");
    expect(leaseIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(leaseIdx);
  });

  it('thoát sớm với LOCK_HELD khi lease đã bị giữ', () => {
    expect(autoSubmitSrc).toContain('LOCK_HELD');
    expect(autoSubmitSrc).toMatch(/leaseOk !== true/);
  });

  it('luôn trả lease trong finally', () => {
    expect(autoSubmitSrc).toContain('job_release_lease');
    expect(autoSubmitSrc).toMatch(/finally \{\s*await releaseLease\(\);/);
  });
});
