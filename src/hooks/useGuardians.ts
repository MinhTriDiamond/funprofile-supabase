import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDID } from './useDID';
import { useCurrentUser } from './useCurrentUser';

export function useMyGuardians() {
  const { data: did } = useDID();
  return useQuery({
    queryKey: ['guardians', did?.did_id],
    enabled: !!did?.did_id,
    queryFn: async () => {
      const { data } = await (supabase as any).from('identity_guardians')
        .select('*').eq('did_id', did!.did_id).order('invited_at', { ascending: false });
      return data ?? [];
    },
  });
}

export function usePendingGuardianInvitations() {
  const { data: did } = useDID();
  return useQuery({
    queryKey: ['guardian-invites', did?.did_id],
    enabled: !!did?.did_id,
    queryFn: async () => {
      const { data } = await (supabase as any).from('identity_guardians')
        .select('*, did_registry!identity_guardians_did_id_fkey(did_id, owner_user_id)')
        .eq('guardian_did_id', did!.did_id).eq('status', 'pending');
      return data ?? [];
    },
  });
}

export function usePendingRecoveries() {
  const { data: did } = useDID();
  return useQuery({
    queryKey: ['pending-recoveries', did?.did_id],
    enabled: !!did?.did_id,
    queryFn: async () => {
      // recoveries cho tài khoản con đang là guardian
      const { data: g } = await (supabase as any).from('identity_guardians')
        .select('did_id').eq('guardian_did_id', did!.did_id).eq('status', 'active');
      const dids = (g ?? []).map((x: any) => x.did_id);
      if (dids.length === 0) return [];
      const { data } = await (supabase as any).from('identity_recovery_log')
        .select('*').in('did_id', dids).eq('status', 'pending')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });
}
