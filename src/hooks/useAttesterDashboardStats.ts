/**
 * useAttesterDashboardStats — Số liệu tổng hợp toàn bảng cho GOV Multisig Dashboard.
 * Không bị ảnh hưởng bởi LIMIT của RPC danh sách.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AttesterDashboardStats {
  pending_sig_count: number;
  pending_sig_fun: number;
  signing_count: number;
  signing_fun: number;
  signed_count: number;
  signed_fun: number;
  rejected_24h_count: number;
  rejected_24h_fun: number;
  confirmed_count: number;
  confirmed_fun: number;
  total_in_dashboard: number;
  is_capped: boolean;
}

const ZERO_STATS: AttesterDashboardStats = {
  pending_sig_count: 0, pending_sig_fun: 0,
  signing_count: 0, signing_fun: 0,
  signed_count: 0, signed_fun: 0,
  rejected_24h_count: 0, rejected_24h_fun: 0,
  confirmed_count: 0, confirmed_fun: 0,
  total_in_dashboard: 0,
  is_capped: false,
};

export function useAttesterDashboardStats(walletAddr?: string | null, enabled = true) {
  const qc = useQueryClient();
  const key = ['attester-dashboard-stats', walletAddr?.toLowerCase() ?? null] as const;

  const query = useQuery({
    queryKey: key,
    enabled: enabled && !!walletAddr,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<AttesterDashboardStats> => {
      if (!walletAddr) return ZERO_STATS;
      const { data, error } = await supabase.rpc('get_attester_dashboard_stats', {
        wallet_addr: walletAddr,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return ZERO_STATS;
      return {
        pending_sig_count: Number(row.pending_sig_count ?? 0),
        pending_sig_fun: Number(row.pending_sig_fun ?? 0),
        signing_count: Number(row.signing_count ?? 0),
        signing_fun: Number(row.signing_fun ?? 0),
        signed_count: Number(row.signed_count ?? 0),
        signed_fun: Number(row.signed_fun ?? 0),
        rejected_24h_count: Number(row.rejected_24h_count ?? 0),
        rejected_24h_fun: Number(row.rejected_24h_fun ?? 0),
        confirmed_count: Number(row.confirmed_count ?? 0),
        confirmed_fun: Number(row.confirmed_fun ?? 0),
        total_in_dashboard: Number(row.total_in_dashboard ?? 0),
        is_capped: !!row.is_capped,
      };
    },
  });

  // Realtime: invalidate khi pplp_mint_requests đổi
  useEffect(() => {
    if (!enabled || !walletAddr) return;
    const channel = supabase
      .channel(`attester-stats-${walletAddr.toLowerCase()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pplp_mint_requests' }, () => {
        qc.invalidateQueries({ queryKey: key });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [enabled, walletAddr, qc]);

  return {
    stats: query.data ?? ZERO_STATS,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
