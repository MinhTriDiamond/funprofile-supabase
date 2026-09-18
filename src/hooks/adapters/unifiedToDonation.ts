/**
 * unifiedToDonation — adapter Batch 2.3.1
 *
 * Ánh xạ `UnifiedTransactionRow` (RPC `get_unified_transactions`) → `DonationRecord`
 * (shape của hook legacy `usePublicDonationHistory`) để V2 hook giữ nguyên public API.
 *
 * QUY TẮC MAP:
 *  - donation  → giữ nguyên, dùng sender_/recipient_ đã enrich.
 *  - transfer  → `direction` từ row.direction; sender/recipient theo direction; counterparty_address.
 *  - swap      → dựng dual-amount từ metadata.pair_symbol / pair_amount (fallback từ token_symbol).
 *
 * KHÔNG throw. Row không đủ dữ liệu → trả về record với field rỗng, KHÔNG null-crash consumer.
 */

import type { UnifiedTransactionRow } from '@/components/transactions/types';
import type { DonationRecord } from '@/hooks/usePublicDonationHistory';

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function tableToType(sourceTable: string | null): DonationRecord['type'] {
  if (!sourceTable) return 'donation';
  const t = sourceTable.toLowerCase();
  if (t.includes('swap')) return 'swap';
  if (t.includes('transfer')) return 'transfer';
  return 'donation';
}

export interface AdapterContext {
  /** User đang được xem (target profile). Dùng để suy `direction` cho donation. */
  targetUserId?: string | null;
}

export function unifiedRowToDonationRecord(
  row: UnifiedTransactionRow,
  ctx: AdapterContext = {},
): DonationRecord {
  const type = tableToType(row.source_table);
  const meta = (row.metadata ?? {}) as Record<string, unknown>;

  // Swap dual-amount từ metadata (SSOT chuẩn) hoặc fallback.
  let from_symbol: string | undefined;
  let to_symbol: string | undefined;
  let from_amount: number | undefined;
  let to_amount: number | undefined;
  if (type === 'swap') {
    const pairSym = typeof meta.pair_symbol === 'string' ? meta.pair_symbol : null;
    const pairAmt = meta.pair_amount != null ? n(meta.pair_amount) : null;
    if (row.direction === 'out') {
      from_symbol = row.token_symbol ?? undefined;
      from_amount = n(row.amount_decimal);
      to_symbol = pairSym ?? undefined;
      to_amount = pairAmt ?? undefined;
    } else if (row.direction === 'in') {
      to_symbol = row.token_symbol ?? undefined;
      to_amount = n(row.amount_decimal);
      from_symbol = pairSym ?? undefined;
      from_amount = pairAmt ?? undefined;
    } else {
      from_symbol = row.token_symbol ?? undefined;
      from_amount = n(row.amount_decimal);
    }
  }

  // Direction cho transfer/donation (giữ 'in' | 'out' | undefined như legacy).
  let direction: 'in' | 'out' | undefined;
  if (row.direction === 'in' || row.direction === 'out') direction = row.direction;

  // sender_id / recipient_id ưu tiên các field enrichment mới; fallback theo direction.
  const senderId = row.sender_user_id ?? (direction === 'out' ? row.user_id : row.counterparty_user_id) ?? null;
  const recipientId = row.recipient_user_id ?? (direction === 'in' ? row.user_id : row.counterparty_user_id) ?? null;

  return {
    id: `${row.source_table ?? 'row'}-${row.source_id ?? row.id}`,
    amount: String(row.amount_decimal ?? row.amount_raw ?? '0'),
    token_symbol: row.token_symbol ?? '',
    tx_hash: row.tx_hash ?? '',
    status: row.status ?? 'unknown',
    message: (typeof meta.message === 'string' ? meta.message : row.memo) ?? null,
    created_at: row.occurred_at ?? row.created_at,
    chain_id: n(row.chain_id),
    sender_id: senderId,
    recipient_id: recipientId,
    sender_username: row.sender_username ?? null,
    sender_display_name: row.sender_display_name ?? null,
    sender_avatar_url: row.sender_avatar_url ?? null,
    recipient_username: row.recipient_username ?? null,
    recipient_display_name: row.recipient_display_name ?? null,
    recipient_avatar_url: row.recipient_avatar_url ?? null,
    type,
    is_external: row.is_external ?? false,
    sender_address: row.sender_address ?? null,
    from_symbol,
    to_symbol,
    from_amount,
    to_amount,
    direction,
    counterparty_address:
      row.direction === 'in' ? (row.sender_address ?? undefined)
        : row.direction === 'out' ? (row.recipient_address ?? undefined)
        : undefined,
  };
}
