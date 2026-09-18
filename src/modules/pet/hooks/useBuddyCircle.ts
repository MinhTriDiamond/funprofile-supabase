import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface BuddyCircle {
  id: string;
  name: string;
  owner_id: string;
  max_members: number;
  invite_code: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface BuddyMember {
  circle_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export interface BuddyQuest {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  mood_boost: boolean;
  display_order: number;
}

export interface BuddyProgressRow {
  circle_id: string;
  user_id: string;
  quest_id: string;
  utc_date: string;
  completed_at: string;
}

export function buddyErrorToMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (m.includes('NOT_AUTHENTICATED')) return 'Bạn cần đăng nhập.';
  if (m.includes('INVALID_SIZE')) return 'Sức chứa nhóm phải 2–10 người.';
  if (m.includes('INVALID_NAME')) return 'Tên nhóm cần ít nhất 2 ký tự.';
  if (m.includes('TOO_MANY_CIRCLES')) return 'Bạn đang sở hữu 3 nhóm hoạt động — hãy lưu trữ bớt.';
  if (m.includes('INVALID_CODE')) return 'Mã mời không đúng hoặc nhóm đã đóng.';
  if (m.includes('ALREADY_MEMBER')) return 'Bạn (hoặc người được mời) đã ở trong nhóm này.';
  if (m.includes('CIRCLE_FULL')) return 'Nhóm đã đủ thành viên.';
  if (m.includes('CIRCLE_NOT_FOUND')) return 'Không tìm thấy nhóm.';
  if (m.includes('NOT_MEMBER')) return 'Bạn không thuộc nhóm này.';
  if (m.includes('CANNOT_INVITE_SELF')) return 'Không thể mời chính mình.';
  if (m.includes('QUEST_NOT_FOUND')) return 'Nhiệm vụ không tồn tại.';
  if (m.includes('QUEST_NOT_DONE_YET')) return 'Bạn chưa hoàn tất nhiệm vụ này hôm nay. Hãy thực hiện trước rồi quay lại bấm xác nhận nha.';
  return m || 'Có lỗi xảy ra.';
}

export function useMyBuddyCircles() {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['buddy-circles', userId],
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async (): Promise<BuddyCircle[]> => {
      const { data: members, error: e1 } = await supabase
        .from('buddy_members' as never)
        .select('circle_id')
        .eq('user_id', userId!);
      if (e1) throw e1;
      const ids = (members ?? []).map((m: any) => m.circle_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('buddy_circles' as never)
        .select('*')
        .in('id', ids)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BuddyCircle[];
    },
  });
}

export function useBuddyMembers(circleId: string | null) {
  return useQuery({
    queryKey: ['buddy-members', circleId],
    enabled: !!circleId,
    staleTime: 15_000,
    queryFn: async (): Promise<BuddyMember[]> => {
      const { data, error } = await supabase
        .from('buddy_members' as never)
        .select('*')
        .eq('circle_id', circleId!)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      if (rows.length === 0) return [];
      const { data: profiles } = await supabase
        .from('public_profiles' as never)
        .select('id, display_name, username, avatar_url')
        .in('id', rows.map(r => r.user_id));
      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return rows.map(r => ({
        ...r,
        display_name: pmap.get(r.user_id)?.display_name ?? null,
        username: pmap.get(r.user_id)?.username ?? null,
        avatar_url: pmap.get(r.user_id)?.avatar_url ?? null,
      })) as BuddyMember[];
    },
  });
}

export function useBuddyQuests() {
  return useQuery({
    queryKey: ['buddy-quests'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BuddyQuest[]> => {
      const { data, error } = await supabase
        .from('buddy_daily_quests' as never)
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BuddyQuest[];
    },
  });
}

function todayUtc(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString().slice(0, 10);
}

export function useBuddyProgressToday(circleId: string | null) {
  return useQuery({
    queryKey: ['buddy-progress', circleId, todayUtc()],
    enabled: !!circleId,
    staleTime: 10_000,
    queryFn: async (): Promise<BuddyProgressRow[]> => {
      const { data, error } = await supabase
        .from('buddy_daily_progress' as never)
        .select('*')
        .eq('circle_id', circleId!)
        .eq('utc_date', todayUtc());
      if (error) throw error;
      return (data ?? []) as unknown as BuddyProgressRow[];
    },
  });
}

export function useCreateBuddyCircle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string; max_members: number }): Promise<BuddyCircle> => {
      const { data, error } = await supabase.rpc(
        'buddy_circle_create' as never,
        { _name: vars.name, _max_members: vars.max_members } as never,
      );
      if (error) throw new Error(error.message);
      return data as unknown as BuddyCircle;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buddy-circles'] }),
  });
}

export function useJoinBuddyByCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string): Promise<BuddyCircle> => {
      const { data, error } = await supabase.rpc(
        'buddy_circle_join_by_code' as never,
        { _code: code } as never,
      );
      if (error) throw new Error(error.message);
      return data as unknown as BuddyCircle;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buddy-circles'] }),
  });
}

export function useInviteToBuddy() {
  return useMutation({
    mutationFn: async (vars: { circle_id: string; user_id: string }) => {
      const { error } = await supabase.rpc(
        'buddy_circle_invite' as never,
        { _circle_id: vars.circle_id, _user_id: vars.user_id } as never,
      );
      if (error) throw new Error(error.message);
    },
  });
}

export function useLeaveBuddy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (circleId: string) => {
      const { error } = await supabase.rpc(
        'buddy_circle_leave' as never,
        { _circle_id: circleId } as never,
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buddy-circles'] });
      qc.invalidateQueries({ queryKey: ['buddy-members'] });
    },
  });
}

export function useCompleteBuddyQuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { circle_id: string; quest_id: string }) => {
      const { data, error } = await supabase.rpc(
        'buddy_quest_complete' as never,
        { _circle_id: vars.circle_id, _quest_id: vars.quest_id } as never,
      );
      if (error) throw new Error(error.message);
      return data as { just_completed: boolean; done_today: number; total_quests: number; all_done_today: boolean };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['buddy-progress', vars.circle_id, todayUtc()] });
      qc.invalidateQueries({ queryKey: ['pet-state'] });
    },
  });
}

// Search candidates (any user with a pet, not in current circle)
export interface BuddyCandidate {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  has_pet: boolean;
}

export function useSearchBuddyCandidates(query: string, excludeIds: string[]) {
  const { userId } = useCurrentUser();
  const q = query.trim();
  return useQuery({
    queryKey: ['buddy-search', userId, q.toLowerCase(), excludeIds.join(',')],
    enabled: !!userId && q.length >= 2,
    staleTime: 10_000,
    queryFn: async (): Promise<BuddyCandidate[]> => {
      const like = `%${q}%`;
      const { data: profiles, error } = await supabase
        .from('public_profiles' as never)
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .neq('id', userId!)
        .limit(20);
      if (error) throw error;
      const list = (profiles ?? []) as any[];
      const filtered = list.filter(p => !excludeIds.includes(p.id));
      if (filtered.length === 0) return [];
      const { data: pets } = await supabase
        .from('pet_states' as never)
        .select('user_id')
        .in('user_id', filtered.map(p => p.id));
      const petSet = new Set((pets ?? []).map((p: any) => p.user_id));
      return filtered.map(p => ({
        user_id: p.id,
        display_name: p.display_name,
        username: p.username,
        avatar_url: p.avatar_url,
        has_pet: petSet.has(p.id),
      }));
    },
  });
}
