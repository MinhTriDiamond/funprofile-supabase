import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

// Danh sách orgs mà user là member
export function useMyOrgs() {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['my-orgs', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: did } = await (supabase as any).from('did_registry').select('did_id').eq('owner_user_id', userId).maybeSingle();
      if (!did) return [];
      const { data, error } = await (supabase as any).from('org_members')
        .select('*, org:org_did_id(did_id, did_level, status, org_profile(*))')
        .eq('member_did_id', did.did_id).eq('status', 'active');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Public: list tất cả orgs
export function useAllOrgs() {
  return useQuery({
    queryKey: ['all-orgs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('org_profile')
        .select('*, did_registry!inner(did_level, status)').order('member_count', { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Members của 1 org
export function useOrgMembers(orgDidId?: string) {
  return useQuery({
    queryKey: ['org-members', orgDidId],
    enabled: !!orgDidId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('org_members')
        .select('*, member_did:member_did_id(did_id, did_level, owner_user_id, profiles:owner_user_id(username, display_name, avatar_url))')
        .eq('org_did_id', orgDidId).order('joined_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAllValidators() {
  return useQuery({
    queryKey: ['all-validators'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('validator_profile')
        .select('*, did_registry!inner(did_level, status), trust_profile(tc, trust_tier)')
        .order('stake_amount', { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMyAIAgents() {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['my-ai-agents', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('ai_agent_profile')
        .select('*, did_registry!inner(did_level, status), trust_profile(tc, trust_tier)')
        .eq('did_registry.owner_user_id', userId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAllAIAgents() {
  return useQuery({
    queryKey: ['all-ai-agents'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('ai_agent_profile')
        .select('*, did_registry!inner(did_level, status), trust_profile(tc, trust_tier)')
        .eq('status', 'active').limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}
