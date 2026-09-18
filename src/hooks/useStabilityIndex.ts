import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StabilityIndexRow {
  snapshot_date: string;
  ls_volatility_30d: number;
  behavior_consistency: number;
  network_stability: number;
  stability_index: number;
}

export function useStabilityIndex(userId?: string) {
  return useQuery<StabilityIndexRow | null>({
    queryKey: ['pplp-v25-stability', userId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = userId ?? session?.user?.id;
      if (!uid) return null;
      const { data } = await supabase
        .from('pplp_v25_stability_index')
        .select('snapshot_date, ls_volatility_30d, behavior_consistency, network_stability, stability_index')
        .eq('user_id', uid)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    staleTime: 5 * 60_000,
  });
}
