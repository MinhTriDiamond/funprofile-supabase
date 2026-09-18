import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePendingClaims(userId: string | null) {
  return useQuery({
    queryKey: ['pending-claims', userId],
    enabled: !!userId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_claims')
        .select('id, amount, status, created_at')
        .eq('user_id', userId!)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}
