import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDID } from '@/hooks/useDID';

export function useIdentityLinks() {
  const { data: did } = useDID();
  return useQuery({
    queryKey: ['identity-links', did?.did_id],
    enabled: !!did?.did_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('identity_links').select('*')
        .eq('did_id', did!.did_id).order('linked_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
