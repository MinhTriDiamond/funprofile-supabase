/**
 * mapUnifiedToRows — map `UnifiedTransactionRow` (SSOT v_unified_transactions)
 * → `TxExportRow` cho Excel export.
 *
 * KHÔNG đụng business logic. Chỉ format. Giữ đúng nhãn tiếng Việt như
 * `mapRows.ts` để file export cũ/mới đọc giống nhau.
 */
import type { TxExportRow } from './types';
import type { UnifiedTransactionRow } from '@/components/transactions/types';
import { getGiftTokenLabel } from '@/lib/giftTokenLabel';

const STATUS_VI: Record<string, string> = {
  confirmed: 'Thành công',
  success: 'Thành công',
  completed: 'Thành công',
  pending: 'Đang xử lý',
  processing: 'Đang xử lý',
  failed: 'Thất bại',
};

const TYPE_VI: Record<string, string> = {
  gift: 'Tặng quà',
  donation: 'Tặng quà',
  swap: 'Hoán đổi',
  transfer: 'Chuyển khoản',
  external: 'Chuyển ví ngoài',
};

function chainName(chain: string | null | undefined, chainId: number | null | undefined): string | null {
  if (chainId === 56) return 'BSC';
  if (chainId === 97) return 'BSC Testnet';
  if (chainId === 1) return 'Ethereum';
  if (chainId === 0) return 'Bitcoin';
  if (chain) return chain;
  return chainId != null ? `Chain ${chainId}` : null;
}

function partyLabel(
  displayName?: string | null,
  username?: string | null,
  isExternal?: boolean | null,
): string {
  return (
    displayName ||
    (username ? `@${username}` : '') ||
    (isExternal ? 'Ví ngoài' : 'Ẩn danh')
  );
}

export function mapUnifiedToRows(rows: UnifiedTransactionRow[]): TxExportRow[] {
  return rows.map((r, idx) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const txType = (r.tx_type ?? '').toLowerCase();

    let token = getGiftTokenLabel(r.token_symbol ?? '', r.chain_id ?? undefined);
    let amount = Number(r.amount_decimal ?? 0) || 0;
    let typeLabel = TYPE_VI[txType] || (r.tx_type ?? '—');

    if (txType === 'swap') {
      const pairSymbol = typeof meta.pair_symbol === 'string' ? meta.pair_symbol : '';
      typeLabel =
        r.direction === 'in'
          ? `Hoán đổi ${pairSymbol}→${r.token_symbol ?? ''}`.trim()
          : `Hoán đổi ${r.token_symbol ?? ''}→${pairSymbol}`.trim();
    }

    return {
      stt: idx + 1,
      transactionId: `${r.source_table}:${r.source_id}`,
      occurredAt: new Date(r.occurred_at ?? r.created_at),
      direction: r.direction ?? null,
      type: typeLabel,
      status: STATUS_VI[(r.status ?? '').toLowerCase()] || r.status || '—',
      fromLabel: partyLabel(r.sender_display_name, r.sender_username, r.is_external),
      fromUsername: r.sender_username ?? null,
      fromAddress: r.sender_address ?? null,
      toLabel: partyLabel(r.recipient_display_name, r.recipient_username, r.is_external),
      toUsername: r.recipient_username ?? null,
      toAddress: r.recipient_address ?? null,
      token,
      amount,
      fee: r.fee_raw != null ? Number(r.fee_raw) || 0 : null,
      network: chainName(r.chain, r.chain_id),
      chain: r.chain ?? null,
      txHash: r.tx_hash ?? null,
      note: (typeof meta.message === 'string' ? meta.message : r.memo) ?? '',
      source: r.is_external ? 'Ví ngoài' : (r.source_table ?? '—'),
      sourceId: r.source_id ?? null,
    };
  });
}
