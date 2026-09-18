import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TIERS, PILLARS } from '@/config/pplp';
import { queryClient as globalQueryClient } from '@/lib/queryClient';

export interface V2UnifiedData {
  v2_light_score: number;
  v2_actions_count: number;
  v2_minted_amount: number;
  combined_light_score: number;
  combined_actions_count: number;
  recent_v2_actions: Array<{
    id: string;
    action_code: string;
    action_group: string;
    description: string;
    status: string;
    created_at: string;
    validation: {
      status: string;
      light_score: number;
      pillar_scores: any;
    } | null;
  }>;
}

export interface LightScoreData {
  user_id: string;
  total_light_score: number;
  tier: number;
  tier_name: string;
  daily_cap: number;
  today_minted: number;
  total_minted: number;
  actions_count: number;
  pending_count: number;
  pending_amount: number;
  pillars: {
    service: number;
    truth: number;
    healing: number;
    value: number;
    unity: number;
  };
  averages: {
    quality: number;
    impact: number;
    integrity: number;
    unity: number;
  };
  recent_actions: Array<{
    id: string;
    action_type: string;
    light_score: number;
    mint_status: string;
    mint_amount: number;
    content_preview: string | null;
    created_at: string;
  }>;
  consistency_streak: number;
  sequence_bonus: number;
  last_action_at: string | null;
  last_mint_at: string | null;
  epoch?: {
    epoch_date: string;
    total_minted: number;
    total_cap: number;
  };
  // Dimension scoring
  dimensions?: {
    identity: number;
    activity: number;
    onchain: number;
    transparency: number;
    ecosystem: number;
  };
  dimension_total?: number;
  dimension_level?: string;
  risk_penalty?: number;
  streak_bonus_pct?: number;
  inactive_days?: number;
  decay_applied?: boolean;
  // v2 unified data
  v2?: V2UnifiedData | null;
}

// Fetcher separated so it can be called standalone (e.g. invalidation)
async function fetchLightScoreData(): Promise<LightScoreData> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await supabase.functions.invoke('pplp-get-score', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) throw new Error(response.error.message);

  if (response.data?.success) return response.data.data as LightScoreData;
  throw new Error(response.data?.error || 'Failed to fetch light score');
}

// MED-1: Migrated to React Query for automatic deduplication, caching, retry
// Multiple components mounting useLightScore share the same cached result.
export const useLightScore = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<LightScoreData>({
    queryKey: ['light-score'],
    queryFn: fetchLightScoreData,
    staleTime: 60_000,         // treat data fresh for 60s
    gcTime: 5 * 60_000,        // keep in cache for 5 min after unmount
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Helper to get tier info
  const getTierInfo = () => {
    if (!data) return TIERS[0];
    return TIERS[data.tier as keyof typeof TIERS] || TIERS[0];
  };

  // Helper to get progress to next tier
  const getNextTierProgress = () => {
    if (!data) return { progress: 0, nextTier: TIERS[1], remaining: 1000 };
    
    const currentTier = data.tier;
    const currentScore = data.total_light_score;
    
    if (currentTier >= 3) {
      return { progress: 100, nextTier: TIERS[3], remaining: 0 };
    }
    
    const nextTier = TIERS[(currentTier + 1) as keyof typeof TIERS];
    const currentTierMin = TIERS[currentTier as keyof typeof TIERS].minScore;
    const nextTierMin = nextTier.minScore;
    
    const progress = ((currentScore - currentTierMin) / (nextTierMin - currentTierMin)) * 100;
    const remaining = nextTierMin - currentScore;
    
    return { 
      progress: Math.min(100, Math.max(0, progress)), 
      nextTier, 
      remaining: Math.max(0, remaining) 
    };
  };

  return {
    data: data ?? null,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch: async () => { await refetch(); },
    getTierInfo,
    getNextTierProgress,
    TIERS,
    PILLARS,
  };
};

// Utility: invalidate light-score cache from anywhere (e.g. after mint success)
export function invalidateLightScore() {
  globalQueryClient.invalidateQueries({ queryKey: ['light-score'] });
}
