import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function useTrustProfile(didId?: string) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['trust-profile', didId, userId],
    enabled: !!(didId || userId),
    queryFn: async () => {
      let resolvedDid = didId;
      if (!resolvedDid && userId) {
        const { data: did } = await (supabase as any)
          .from('did_registry').select('did_id').eq('owner_user_id', userId).maybeSingle();
        resolvedDid = did?.did_id;
      }
      if (!resolvedDid) return null;
      const { data, error } = await (supabase as any)
        .from('trust_profile').select('*').eq('did_id', resolvedDid).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}
