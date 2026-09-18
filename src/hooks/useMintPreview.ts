import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MintPreview {
  phase: string;
  delta_ls: number;
  window_days: number;
  tc: number;
  stability_index: number;
  trust_tier?: string;
  sybil_risk?: string;
  did_level?: string;
  mint_base_rate: number;
  tc_weight: number;
  stability_weight: number;
  min_tc_to_mint: number;
  max_mint_per_epoch_per_user: number;
  eligible: boolean;
  raw_mint: number;
  mint_estimate: number;
  gate_reason?: string | null;
  formula: string;
}

async function fetchPreview(userId?: string): Promise<MintPreview | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase.functions.invoke('pplp-v25-mint-preview', {
    body: userId ? { user_id: userId } : {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw new Error(error.message);
  return data?.data ?? null;
}

export function useMintPreview(userId?: string) {
  return useQuery<MintPreview | null>({
    queryKey: ['pplp-v25-mint-preview', userId],
    queryFn: () => fetchPreview(userId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
