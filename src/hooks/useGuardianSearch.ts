import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GuardianCandidate {
  user_id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  did_id: string | null;
  did_level: string | null;
}

/**
 * Tìm guardian theo email / username / display_name / DID id.
 * Trả về danh sách candidate kèm did_id (nếu đã có DID).
 */
export function useGuardianSearch(query: string, excludeUserId?: string) {
  const q = query.trim();
  return useQuery<GuardianCandidate[]>({
    queryKey: ['guardian-search', q, excludeUserId],
    enabled: q.length >= 2,
    staleTime: 15_000,
    queryFn: async () => {
      // Trường hợp người dùng nhập trực tiếp DID
      if (q.startsWith('did:fun:')) {
        const { data: did } = await (supabase as any)
          .from('did_registry')
          .select('did_id, did_level, owner_user_id')
          .eq('did_id', q)
          .maybeSingle();
        if (!did) return [];
        const { data: prof } = await (supabase as any)
          .from('profiles')
          .select('id, email, display_name, username, avatar_url')
          .eq('id', did.owner_user_id)
          .maybeSingle();
        return [{
          user_id: did.owner_user_id,
          email: prof?.email ?? null,
          display_name: prof?.display_name ?? null,
          username: prof?.username ?? null,
          avatar_url: prof?.avatar_url ?? null,
          did_id: did.did_id,
          did_level: did.did_level,
        }];
      }

      // Tìm theo profiles
      const like = `%${q}%`;
      const { data: profiles } = await (supabase as any)
        .from('profiles')
        .select('id, email, display_name, username, avatar_url')
        .or(`email.ilike.${like},display_name.ilike.${like},username.ilike.${like}`)
        .limit(8);

      const list = (profiles ?? []).filter((p: any) => p.id !== excludeUserId);
      if (list.length === 0) return [];

      // Resolve DID cho từng user
      const ids = list.map((p: any) => p.id);
      const { data: dids } = await (supabase as any)
        .from('did_registry')
        .select('owner_user_id, did_id, did_level')
        .in('owner_user_id', ids);

      const didMap = new Map<string, any>();
      (dids ?? []).forEach((d: any) => didMap.set(d.owner_user_id, d));

      return list.map((p: any) => ({
        user_id: p.id,
        email: p.email,
        display_name: p.display_name,
        username: p.username,
        avatar_url: p.avatar_url,
        did_id: didMap.get(p.id)?.did_id ?? null,
        did_level: didMap.get(p.id)?.did_level ?? null,
      }));
    },
  });
}
