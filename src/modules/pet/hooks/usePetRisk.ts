import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export type RiskTier = 'safe' | 'watch' | 'restricted' | 'frozen';

export interface PetRiskScore {
  user_id: string;
  risk_score: number;
  risk_tier: RiskTier;
  signal_count: number;
  last_reasons: string[];
  updated_at: string;
}

export interface PetRiskAppeal {
  id: string;
  user_id: string;
  message: string;
  evidence_urls: string[];
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function usePetRisk(userId?: string | null) {
  const { userId: meId } = useCurrentUser();
  const uid = userId ?? meId;
  return useQuery({
    queryKey: ['pet-risk', uid],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async (): Promise<PetRiskScore | null> => {
      const { data, error } = await supabase
        .from('pet_risk_scores' as never)
        .select('*')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PetRiskScore | null;
    },
  });
}

export function isPetActionBlocked(tier?: RiskTier | null, action?: 'cheer_stranger' | 'shop' | 'xp' | 'box'): boolean {
  if (!tier || tier === 'safe' || tier === 'watch') return false;
  if (tier === 'frozen') return true;
  // restricted: chặn shop và cheer cho người lạ
  if (action === 'shop' || action === 'cheer_stranger') return true;
  return false;
}

export function petRiskTierLabel(tier: RiskTier): { label: string; color: string } {
  switch (tier) {
    case 'frozen': return { label: 'Khoá', color: 'destructive' };
    case 'restricted': return { label: 'Hạn chế', color: 'destructive' };
    case 'watch': return { label: 'Theo dõi', color: 'warning' };
    default: return { label: 'An toàn', color: 'success' };
  }
}

export function useSubmitPetRiskAppeal() {
  const qc = useQueryClient();
  const { userId } = useCurrentUser();
  return useMutation({
    mutationFn: async (args: { message: string; evidence_urls?: string[] }) => {
      if (!userId) throw new Error('NOT_AUTHENTICATED');
      const { data, error } = await supabase
        .from('pet_risk_appeals' as never)
        .insert({ user_id: userId, message: args.message, evidence_urls: args.evidence_urls ?? [] } as never)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pet-risk-appeals'] });
    },
  });
}

export function usePetRiskAppeals() {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['pet-risk-appeals', userId],
    enabled: !!userId,
    queryFn: async (): Promise<PetRiskAppeal[]> => {
      const { data, error } = await supabase
        .from('pet_risk_appeals' as never)
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PetRiskAppeal[];
    },
  });
}
