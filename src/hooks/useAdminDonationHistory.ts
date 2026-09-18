/**
 * useAdminDonationHistory — Batch 2.3 (M6D)
 *
 * SSOT hoàn tất:
 * - Rows: `get_unified_transactions` scope `admin_all` (Batch 2.2).
 * - Stats: `get_unified_admin_stats` (Batch 2.3) — 1 RPC aggregate thay 5
 *   query direct-read + vòng lặp phân trang.
 *
 * Giữ nguyên public API để `DonationHistoryAdminTab` không phải sửa.
 */


import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DonationRecord } from '@/types/donation';
// getVNTodayRange no longer needed — RPC get_unified_admin_stats tính VN timezone server-side.
import { useUnifiedTransactionHistory } from '@/hooks/useUnifiedTransactionHistory';
import type { UnifiedTransactionRow } from '@/components/transactions/types';

export interface AdminDonationFilters {
  searchTerm: string;
  tokenSymbol: string;
  status: 'all' | 'pending' | 'confirmed' | 'failed';
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
  onlyOnchain: boolean;
  type: 'all' | 'reward' | 'transfer';
}

export interface AdminDonationStats {
  totalCount: number;
  totalByToken: Record<string, number>;
  totalLightScore: number;
}

const DEFAULT_FILTERS: AdminDonationFilters = {
  searchTerm: '',
  tokenSymbol: 'all',
  status: 'all',
  dateFrom: '',
  dateTo: '',
  page: 1,
  limit: 50,
  onlyOnchain: false,
  type: 'all',
};

/**
 * Map 1 UnifiedTransactionRow (source_table='donations' hoặc external) → DonationRecord shape
 * mà UI Admin đang show.
 */
function rowToDonation(row: UnifiedTransactionRow): DonationRecord {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const senderProfile = row.sender_user_id
    ? {
        id: row.sender_user_id,
        username: row.sender_username ?? '',
        display_name: row.sender_display_name ?? null,
        avatar_url: row.sender_avatar_url ?? null,
        public_wallet_address: row.sender_wallet_address ?? null,
        btc_address: null,
      }
    : null;
  const recipientProfile = row.recipient_user_id
    ? {
        id: row.recipient_user_id,
        username: row.recipient_username ?? '',
        display_name: row.recipient_display_name ?? null,
        avatar_url: row.recipient_avatar_url ?? null,
        public_wallet_address: row.recipient_wallet_address ?? null,
        btc_address: null,
      }
    : {
        // Vẫn cần recipient object cho UI — fallback nếu thiếu.
        id: row.user_id ?? row.source_id,
        username: row.owner_username ?? '',
        display_name: row.owner_display_name ?? null,
        avatar_url: row.owner_avatar_url ?? null,
        public_wallet_address: null,
        btc_address: null,
      };

  return {
    id: row.source_id,
    sender: senderProfile,
    recipient: recipientProfile,
    amount: String(row.amount_decimal ?? row.amount_raw ?? '0'),
    token_symbol: row.token_symbol ?? '',
    message: row.memo ?? null,
    tx_hash: row.tx_hash ?? '',
    light_score_earned: typeof meta.light_score_earned === 'number'
      ? (meta.light_score_earned as number)
      : null,
    created_at: row.created_at ?? row.occurred_at,
    status: row.status ?? 'confirmed',
    sender_address: row.sender_address ?? null,
    is_external: !!row.is_external,
    metadata: (meta as { sender_name?: string }) ?? null,
  };
}

export function useAdminDonationHistory() {
  const [filters, setFilters] = useState<AdminDonationFilters>(DEFAULT_FILTERS);

  const updateFilters = (newFilters: Partial<AdminDonationFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: newFilters.page ?? 1 }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // ------ Query rows qua RPC unified `admin_all` ------
  const unified = useUnifiedTransactionHistory({
    scope: 'admin_all',
    pageSize: filters.limit,
    filters: {
      status: filters.status === 'all' ? 'all' : filters.status,
      token: filters.tokenSymbol === 'all' ? 'all' : filters.tokenSymbol,
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo ? `${filters.dateTo}T23:59:59` : null,
      search: filters.searchTerm || undefined,
    },
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-donation-history', 'v2', filters, unified.rows.length, unified.total],
    enabled: !unified.isLoading,
    queryFn: async () => {
      // Đảm bảo đã load đủ trang tương ứng `filters.page`
      const targetRows = filters.page * filters.limit;
      while (unified.rows.length < targetRows && unified.hasNextPage && !unified.isFetchingNextPage) {
        await unified.loadMore();
      }

      let rows = unified.rows;

      // Chỉ donations + swap (UI Admin hiện chỉ show quà tặng). External wallet_transfers
      // và transactions off-chain KHÔNG cần cho tab này.
      rows = rows.filter(r => r.source_table === 'donations');

      // Filter type (reward/transfer) client-side — RPC chưa hỗ trợ.
      if (filters.type !== 'all') {
        rows = rows.filter(r => (r.tx_type ?? '').toLowerCase().includes(filters.type));
      }
      // Filter onlyOnchain — bỏ row không có tx_hash.
      if (filters.onlyOnchain) {
        rows = rows.filter(r => !!r.tx_hash);
      }

      const from = (filters.page - 1) * filters.limit;
      const to = from + filters.limit;
      const pageRows = rows.slice(from, to);

      return {
        donations: pageRows.map(rowToDonation),
        totalCount: unified.total,
        totalPages: Math.max(1, Math.ceil(unified.total / filters.limit)),
      };
    },
    staleTime: 30000,
  });

  // ------ Stats block (Batch 2.3 · SSOT) ------
  // 1 RPC aggregate thay 5 query direct-read + vòng lặp phân trang.
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['admin-donation-stats', 'v2'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_unified_admin_stats', {
        _from_ts: undefined,
        _to_ts: undefined,
      });
      if (error) throw error;
      const raw = (data ?? {}) as {
        total_count?: number | string;
        confirmed_count?: number | string;
        pending_count?: number | string;
        today_count?: number | string;
        total_value?: number | string;
        total_light_score?: number | string;
        by_token?: Record<string, number | string> | null;
      };
      const byToken: Record<string, number> = {};
      for (const [sym, amt] of Object.entries(raw.by_token ?? {})) {
        byToken[sym] = Number(amt) || 0;
      }
      return {
        totalCount: Number(raw.total_count ?? 0),
        confirmedCount: Number(raw.confirmed_count ?? 0),
        pendingCount: Number(raw.pending_count ?? 0),
        todayCount: Number(raw.today_count ?? 0),
        totalValue: Number(raw.total_value ?? 0),
        totalByToken: byToken,
        totalLightScore: Number(raw.total_light_score ?? 0),
      };
    },
    staleTime: 60_000,
  });


  return {
    donations: data?.donations || [],
    totalCount: data?.totalCount || 0,
    totalPages: data?.totalPages || 1,
    stats,
    filters,
    isLoading: isLoading || unified.isLoading,
    isStatsLoading,
    updateFilters,
    resetFilters,
    refetch,
  };
}

/**
 * Export CSV — vòng lặp gọi RPC `admin_all` với limit 5000/lần cho tới khi hết.
 */
export async function fetchAllDonationsForExport(
  filters: Partial<AdminDonationFilters> & {
    searchTerm: string;
    tokenSymbol: string;
    status: string;
    dateFrom: string;
    dateTo: string;
    onlyOnchain?: boolean;
  }
): Promise<DonationRecord[]> {
  const CHUNK = 5000;
  let offset = 0;
  let all: UnifiedTransactionRow[] = [];
  const status = filters.status === 'all' ? undefined : filters.status;
  const token = filters.tokenSymbol === 'all' ? undefined : filters.tokenSymbol;
  const search = filters.searchTerm?.trim() || undefined;

  // Tối đa 20 vòng (100K rows) để bảo vệ FE khỏi treo.
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase.rpc('get_unified_transactions', {
      _scope: 'admin_all',
      _status: status,
      _token_symbol: token,
      _from_ts: filters.dateFrom || undefined,
      _to_ts: filters.dateTo ? `${filters.dateTo}T23:59:59` : undefined,
      _search: search,
      _limit: CHUNK,
      _offset: offset,
    });
    if (error) throw error;
    const rows = (data || []) as UnifiedTransactionRow[];
    if (rows.length === 0) break;
    all = all.concat(rows);
    if (rows.length < CHUNK) break;
    offset += CHUNK;
  }

  let filtered = all.filter(r => r.source_table === 'donations');
  if (filters.onlyOnchain) filtered = filtered.filter(r => !!r.tx_hash);

  return filtered.map(rowToDonation);
}
