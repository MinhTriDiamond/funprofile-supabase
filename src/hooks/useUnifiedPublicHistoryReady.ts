/**
 * useUnifiedPublicHistoryReady — Batch 2.3.1 cutover flag.
 *
 * Đọc `app_settings.unified_public_history_ready`. Khi ON → 2 surface top-1
 * (HistoryTab wallet + WalletTransactionHistory profile) chuyển sang V2 (SSOT).
 * Khi OFF → rollback về `usePublicDonationHistory` legacy.
 *
 * Kill-switch: set flag OFF trong `app_settings` → 2 consumer auto rollback,
 * không cần deploy code.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const QK = ['app-settings', 'unified_public_history_ready'] as const;

export function useUnifiedPublicHistoryReady(): { enabled: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: QK,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'unified_public_history_ready')
        .maybeSingle();
      if (error) return false;
      const v = data?.value as unknown;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v === 'true' || v === '1';
      if (v && typeof v === 'object' && 'enabled' in (v as Record<string, unknown>)) {
        return Boolean((v as Record<string, unknown>).enabled);
      }
      return false;
    },
  });
  return { enabled: Boolean(data), isLoading };
}
