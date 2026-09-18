import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDID } from './useDID';

export function useMyDisputes() {
  const { data: did } = useDID();
  return useQuery({
    queryKey: ['my-disputes', did?.did_id],
    enabled: !!did?.did_id,
    queryFn: async () => {
      const { data } = await (supabase as any).from('identity_disputes')
        .select('*').eq('did_id', did!.did_id).order('created_at', { ascending: false });
      return data ?? [];
    },
  });
}

export function useAdminDisputes(statusFilter: string[] = ['pending', 'under_review']) {
  return useQuery({
    queryKey: ['admin-disputes', statusFilter],
    queryFn: async () => {
      const { data } = await (supabase as any).from('identity_disputes')
        .select('*').in('status', statusFilter).order('created_at', { ascending: false }).limit(100);
      return data ?? [];
    },
  });
}
