import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function useUserSBTs(didId?: string) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['user-sbts', didId, userId],
    enabled: !!(didId || userId),
    queryFn: async () => {
      let resolvedDid = didId;
      if (!resolvedDid && userId) {
        const { data: did } = await (supabase as any)
          .from('did_registry').select('did_id').eq('owner_user_id', userId).maybeSingle();
        resolvedDid = did?.did_id;
      }
      if (!resolvedDid) return [];
      const { data, error } = await (supabase as any)
        .from('sbt_registry').select('*').eq('did_id', resolvedDid)
        .order('issued_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}
