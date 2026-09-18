import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LightScoreParams {
  events: any[];
  multipliers: any[];
  legacy: any[];
  phases: any[];
  active_phase: any | null;
  mint_linking: any[];
  fetched_at: string;
}

async function fetchParams(): Promise<LightScoreParams> {
  const { data, error } = await supabase.functions.invoke('pplp-v25-params', { body: {} });
  if (error) throw new Error(error.message);
  return data?.data;
}

export function useLightScoreParams() {
  return useQuery<LightScoreParams>({
    queryKey: ['pplp-v25-params'],
    queryFn: fetchParams,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });
}
