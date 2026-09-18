import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function useDID(userId?: string) {
  const { userId: currentId } = useCurrentUser();
  const targetId = userId ?? currentId;

  return useQuery({
    queryKey: ['did', targetId],
    enabled: !!targetId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('did_registry').select('*').eq('owner_user_id', targetId).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}
