import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildScannerAlertRows,
  SCANNER_ALERT_SOURCE,
  type ScannerMissingCandidate,
} from '../../supabase/functions/_shared/scannerAlert.ts';

const missing: ScannerMissingCandidate[] = [
  {
    tx_hash: '0xabc',
    block: 116943036,
    from: '0x847b',
    to: '0xF6DB',
    amount: '300',
    symbol: 'USDT',
    source: 'erc20',
  },
];

describe('cảnh báo compare-only của scanner RPC', () => {
  it('tạo 1 dòng cho mỗi admin, nội dung nằm trong metadata', () => {
    const rows = buildScannerAlertRows(['a1', 'a2'], missing, 7);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.type).toBe('wallet_reconciliation_alert');
      expect(r.actor_id).toBeTruthy();
      expect(r.metadata.source).toBe(SCANNER_ALERT_SOURCE);
      expect(r.metadata.missing_count).toBe(1);
      expect(r.metadata.candidates_total).toBe(7);
      expect(r.metadata.wallets).toEqual(['0xf6db']);
      expect((r.metadata.samples as unknown[])[0]).toMatchObject({ tx_hash: '0xabc', symbol: 'USDT' });
      // notifications KHÔNG có cột title/content
      expect(r).not.toHaveProperty('title');
      expect(r).not.toHaveProperty('content');
    }
  });

  it('không gửi gì khi không thiếu hoặc không có admin', () => {
    expect(buildScannerAlertRows(['a1'], [], 0)).toHaveLength(0);
    expect(buildScannerAlertRows([], missing, 1)).toHaveLength(0);
  });

  it('scanner-rpc-tick không insert title/content vào notifications', () => {
    const src = readFileSync('supabase/functions/scanner-rpc-tick/index.ts', 'utf8');
    expect(src).toContain('buildScannerAlertRows');
    expect(src).not.toMatch(/title:\s*"/);
    expect(src).not.toMatch(/content:\s*$|content:\s*`/m);
  });
});
