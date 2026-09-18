/**
 * useAdminRole — Singleton cached admin role check
 *
 * Replaces 4+ scattered `supabase.rpc('has_role')` calls with a single
 * React Query entry. Admin role rarely changes → staleTime: 10 minutes.
 *
 * Usage:
 *   const { isAdmin, isLoading } = useAdminRole();
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export const ADMIN_ROLE_QUERY_KEY = ['admin-role'] as const;

export function useAdminRole() {
  const { userId } = useCurrentUser();

  const { data: isAdmin = false, isLoading } = useQuery({
    queryKey: [...ADMIN_ROLE_QUERY_KEY, userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data } = await supabase.rpc('has_role', {
        _user_id: userId,
        _role: 'admin',
      });
      return !!data;
    },
    enabled: !!userId,
    staleTime: 10 * 60_000,   // 10 minutes
    gcTime: 15 * 60_000,
  });

  return { isAdmin, isLoading };
}
