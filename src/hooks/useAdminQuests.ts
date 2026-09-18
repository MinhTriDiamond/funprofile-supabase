/**
 * useAdminQuests — Admin hooks for quest_definitions CRUD + analytics.
 * Gate qua useAdminRole ở component cha. RLS đã enforce admin_write.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type QuestFrequency = 'daily' | 'weekly' | 'once' | 'per_event';
export type TrustTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export interface QuestDefinition {
  id: string;
  code: string;
  title_vi: string;
  title_en: string;
  description: string | null;
  category: string;
  ls_base: number;
  target_count: number;
  frequency: QuestFrequency;
  trigger_event: string;
  trigger_filter: Record<string, unknown> | null;
  trust_tier_min: TrustTier;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type QuestDefinitionInput = Omit<QuestDefinition, 'id' | 'created_at' | 'updated_at'> & { id?: string };

const KEYS = {
  defs: ['admin', 'quest-definitions'] as const,
  topUsers: (search?: string) => ['admin', 'quest-top-users', search ?? ''] as const,
  activity: ['admin', 'quest-activity'] as const,
};

export function useAdminQuestDefinitions() {
  return useQuery({
    queryKey: KEYS.defs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quest_definitions')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuestDefinition[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertQuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuestDefinitionInput) => {
      const payload = { ...input };
      const { error, data } = await supabase
        .from('quest_definitions')
        .upsert(payload as any, { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      return data as QuestDefinition;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.defs });
      toast.success('Đã lưu quest');
    },
    onError: (e: any) => toast.error(`Lưu thất bại: ${e.message ?? e}`),
  });
}

export function useDeleteQuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Chặn nếu đã có progress
      const { count, error: cErr } = await supabase
        .from('quest_user_progress')
        .select('id', { count: 'exact', head: true })
        .eq('quest_id', id);
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) {
        throw new Error(`Quest đã có ${count} tiến độ user, không thể xoá. Hãy tắt is_active thay vì xoá.`);
      }
      const { error } = await supabase.from('quest_definitions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.defs });
      toast.success('Đã xoá quest');
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });
}

export function useToggleQuestActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from('quest_definitions')
        .update({ is_active: value })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, value }) => {
      await qc.cancelQueries({ queryKey: KEYS.defs });
      const prev = qc.getQueryData<QuestDefinition[]>(KEYS.defs);
      if (prev) {
        qc.setQueryData<QuestDefinition[]>(KEYS.defs, prev.map(q => q.id === id ? { ...q, is_active: value } : q));
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEYS.defs, ctx.prev);
      toast.error(`Toggle thất bại: ${e.message ?? e}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.defs }),
  });
}

export interface TopQuestUser {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  total_ls_from_quests: number;
  total_quests_completed: number;
  freeze_passes_remaining: number;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export function useTopQuestUsers(search?: string) {
  return useQuery({
    queryKey: KEYS.topUsers(search),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quest_streaks')
        .select(`
          user_id,
          current_streak,
          longest_streak,
          total_ls_from_quests,
          total_quests_completed,
          freeze_passes_remaining,
          profiles:user_id ( full_name, username, avatar_url )
        `)
        .order('total_ls_from_quests', { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows: TopQuestUser[] = (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        current_streak: r.current_streak ?? 0,
        longest_streak: r.longest_streak ?? 0,
        total_ls_from_quests: Number(r.total_ls_from_quests ?? 0),
        total_quests_completed: r.total_quests_completed ?? 0,
        freeze_passes_remaining: r.freeze_passes_remaining ?? 0,
        full_name: r.profiles?.full_name ?? null,
        username: r.profiles?.username ?? null,
        avatar_url: r.profiles?.avatar_url ?? null,
      }));
      const q = (search ?? '').trim().toLowerCase();
      return q
        ? rows.filter(r => (r.username ?? '').toLowerCase().includes(q) || (r.full_name ?? '').toLowerCase().includes(q))
        : rows;
    },
    staleTime: 60_000,
  });
}

export interface QuestActivityRow {
  id: string;
  user_id: string;
  quest_id: string;
  period_key: string;
  ls_awarded: number;
  completed_at: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  quest_title: string | null;
}

export function useRecentQuestActivity() {
  return useQuery({
    queryKey: KEYS.activity,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('quest_user_progress')
        .select(`
          id, user_id, quest_id, period_key, ls_awarded, completed_at,
          profiles:user_id ( full_name, username, avatar_url ),
          quest_definitions:quest_id ( title_vi )
        `)
        .not('completed_at', 'is', null)
        .gte('completed_at', since)
        .order('completed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as any[]).map<QuestActivityRow>(r => ({
        id: r.id,
        user_id: r.user_id,
        quest_id: r.quest_id,
        period_key: r.period_key,
        ls_awarded: Number(r.ls_awarded ?? 0),
        completed_at: r.completed_at,
        username: r.profiles?.username ?? null,
        full_name: r.profiles?.full_name ?? null,
        avatar_url: r.profiles?.avatar_url ?? null,
        quest_title: r.quest_definitions?.title_vi ?? null,
      }));
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
