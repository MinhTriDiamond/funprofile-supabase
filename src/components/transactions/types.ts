/**
 * Unified Transaction History — shared types.
 * Mọi component / hook trong /components/transactions/ và /hooks/useUnified*
 * đều import từ đây.
 */

export type UnifiedDirection = 'in' | 'out' | 'unknown';
export type UnifiedDirectionConfidence = 'exact' | 'inferred' | 'unknown';
/**
 * M6 SSOT — 4 scope khớp RPC:
 *  - 'self'      → giao dịch của auth.uid() (shortcut của profile(auth.uid))
 *  - 'profile'   → giao dịch của 1 user cụ thể
 *  - 'global'    → quà tặng user↔user public của hệ thống
 *  - 'admin_all' → toàn bộ giao dịch hệ thống (Admin only, có audit log)
 */
export type UnifiedScope = 'self' | 'profile' | 'global' | 'admin_all';

export interface UnifiedTransactionRow {
  id: string;
  user_id: string | null;
  counterparty_user_id: string | null;
  source_table: string;
  source_id: string;
  tx_hash: string | null;
  direction: UnifiedDirection;
  direction_confidence: UnifiedDirectionConfidence;
  tx_type: string | null;
  status: string | null;
  chain: string | null;
  chain_id: number | null;
  network: string | null;
  token_symbol: string | null;
  token_address: string | null;
  decimals: number | null;
  amount_raw: string | null;
  amount_decimal: number | null;
  fee_raw: string | null;
  sender_address: string | null;
  recipient_address: string | null;
  block_number: number | null;
  is_external: boolean | null;
  memo: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
  confirmed_at: string | null;
  created_at: string;
  total_count?: number;

  // M5-UX1 profile enrichment
  owner_display_name?: string | null;
  owner_username?: string | null;
  owner_avatar_url?: string | null;
  counterparty_display_name?: string | null;
  counterparty_username?: string | null;
  counterparty_avatar_url?: string | null;
  sender_user_id?: string | null;
  sender_display_name?: string | null;
  sender_username?: string | null;
  sender_avatar_url?: string | null;
  sender_wallet_address?: string | null;
  recipient_user_id?: string | null;
  recipient_display_name?: string | null;
  recipient_username?: string | null;
  recipient_avatar_url?: string | null;
  recipient_wallet_address?: string | null;
}

export interface UnifiedFilters {
  direction?: UnifiedDirection | 'all';
  status?: string | 'all';
  chain?: string | 'all';
  token?: string | 'all';
  type?: string | 'all';
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string;
  /** Chỉ hiển thị giao dịch có ít nhất 1 đầu là external wallet. */
  externalOnly?: boolean;
  /** Lọc theo user đối tác (counterparty). null/undefined = không lọc. */
  counterpartyUserId?: string | null;
}

export interface UnifiedCounterparty {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  tx_count: number;
}

export interface UnifiedSummaryByKey {
  key: string;
  in: number;
  out: number;
  unknown: number;
  count: number;
}

export interface UnifiedSummary {
  total_count: number;
  count_in: number;
  count_out: number;
  count_unknown: number;
  count_pending: number;
  sum_in: number;
  sum_out: number;
  sum_unknown: number;
  net: number;
  by_token: UnifiedSummaryByKey[];
  by_chain: UnifiedSummaryByKey[];
  by_type: UnifiedSummaryByKey[];
  by_status: UnifiedSummaryByKey[];
}

export interface UnifiedDetailParty {
  user_id: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  address?: string | null;
}

export interface UnifiedDetailResult {
  primary: UnifiedTransactionRow | null;
  counterpart?: UnifiedTransactionRow | null;
  sender?: UnifiedDetailParty | null;
  recipient?: UnifiedDetailParty | null;
  explorer_url?: string | null;
  confirmations?: number | null;
  raw?: Record<string, unknown> | null;
}

export const DEFAULT_PAGE_SIZE = 30;

// Aliases rõ nghĩa theo scope — cùng shape với UnifiedSummaryAggregate.
// Dùng ở M6E Dashboard / Benefactors / Treasury sau này.
export type { UnifiedSummaryAggregate as WalletSummary } from '@/hooks/useUnifiedTransactionHistory';
export type { UnifiedSummaryAggregate as ProfileSummary } from '@/hooks/useUnifiedTransactionHistory';
export type { UnifiedSummaryAggregate as GlobalSummary } from '@/hooks/useUnifiedTransactionHistory';
