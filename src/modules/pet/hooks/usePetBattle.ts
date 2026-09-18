import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface BattleSnapshot {
  user_id: string;
  pet_name: string;
  pet_level: number;
  pet_mood?: string;
  atk: number;
  def: number;
  spd: number;
  lck: number;
  cheers_7d: number;
  cosmetics_equipped: number;
}

export interface BattleRound {
  round: number;
  dmg_challenger: number;
  dmg_opponent: number;
  roll_c: number;
  roll_o: number;
}

export interface BattleUserProfile {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export interface PetBattle {
  id: string;
  challenger_id: string;
  opponent_id: string;
  challenger_snapshot: BattleSnapshot;
  opponent_snapshot: BattleSnapshot;
  status: 'pending' | 'accepted' | 'resolved' | 'declined' | 'expired';
  winner_id: string | null;
  rounds: BattleRound[];
  xp_award_challenger: number;
  xp_award_opponent: number;
  created_at: string;
  resolved_at: string | null;
  expires_at: string;
  season_id: string | null;
  challenger_profile?: BattleUserProfile | null;
  opponent_profile?: BattleUserProfile | null;
}

export function petBattleErrorToMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (m.includes('CANNOT_CHALLENGE_SELF')) return 'Bạn không thể thách đấu chính mình.';
  if (m.includes('NO_PET')) return 'Bạn chưa có linh thú.';
  if (m.includes('OPPONENT_NO_PET')) return 'Đối thủ chưa có linh thú.';
  if (m.includes('RISK_BLOCKED')) return 'Linh thú của bạn đang bị khoá đấu trường.';
  if (m.includes('OPPONENT_FROZEN')) return 'Linh thú đối thủ đang bị khoá.';
  if (m.includes('DAILY_LIMIT_REACHED')) return 'Bạn đã đạt giới hạn 10 trận / 24h.';
  if (m.includes('ALREADY_PENDING')) return 'Đang có 1 lời thách đấu chờ phản hồi.';
  if (m.includes('NOT_PENDING')) return 'Trận đấu đã được xử lý.';
  if (m.includes('EXPIRED')) return 'Trận đấu đã hết hạn.';
  if (m.includes('NOT_OPPONENT')) return 'Bạn không phải đối thủ của trận này.';
  return m || 'Lỗi không xác định.';
}

export function useMyBattles(limit = 30) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['pet-battles', userId],
    enabled: !!userId,
    staleTime: 10_000,
    queryFn: async (): Promise<PetBattle[]> => {
      const { data, error } = await supabase
        .from('pet_battles' as never)
        .select('*')
        .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (data ?? []) as unknown as PetBattle[];
      if (rows.length === 0) return rows;
      const ids = Array.from(new Set(rows.flatMap(r => [r.challenger_id, r.opponent_id])));
      const { data: profiles } = await supabase
        .from('public_profiles' as never)
        .select('id, display_name, username, avatar_url')
        .in('id', ids);
      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, {
        display_name: p.display_name ?? null,
        username: p.username ?? null,
        avatar_url: p.avatar_url ?? null,
      } as BattleUserProfile]));
      return rows.map(r => ({
        ...r,
        challenger_profile: pmap.get(r.challenger_id) ?? null,
        opponent_profile: pmap.get(r.opponent_id) ?? null,
      }));
    },
  });
}

export function useChallengePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opponentId: string): Promise<PetBattle> => {
      const { data, error } = await supabase.rpc(
        'pet_battle_challenge' as never,
        { _opponent_id: opponentId } as never,
      );
      if (error) throw new Error(error.message);
      return data as unknown as PetBattle;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pet-battles'] }),
  });
}

export function useAcceptBattle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (battleId: string): Promise<PetBattle> => {
      const { data, error } = await supabase.rpc(
        'pet_battle_accept' as never,
        { _battle_id: battleId } as never,
      );
      if (error) throw new Error(error.message);
      return data as unknown as PetBattle;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pet-battles'] });
      qc.invalidateQueries({ queryKey: ['pet-state'] });
      qc.invalidateQueries({ queryKey: ['pet-battle-leaderboard'] });
    },
  });
}

export function useDeclineBattle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (battleId: string) => {
      const { data, error } = await supabase.rpc(
        'pet_battle_decline' as never,
        { _battle_id: battleId } as never,
      );
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pet-battles'] }),
  });
}

export interface ArenaOpponent {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  pet_name: string | null;
  pet_level: number;
}

export function useArenaOpponents(limit = 50) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['arena-opponents', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<ArenaOpponent[]> => {
      const { data, error } = await supabase
        .from('pet_arena_public' as never)
        .select('user_id, name, level, risk_tier')
        .gte('level', 1)
        .neq('user_id', userId!)
        .neq('risk_tier', 'frozen')
        .order('level', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const ids = (data ?? []).map((d: any) => d.user_id);
      if (ids.length === 0) return [];

      const { data: profiles } = await supabase
        .from('public_profiles' as never)
        .select('id, username, display_name, avatar_url')
        .in('id', ids);
      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((d: any) => ({
        user_id: d.user_id,
        display_name: pmap.get(d.user_id)?.display_name ?? null,
        username: pmap.get(d.user_id)?.username ?? null,
        avatar_url: pmap.get(d.user_id)?.avatar_url ?? null,
        pet_name: d.name,
        pet_level: d.level,
      }));
    },
  });
}

export interface ArenaSearchResult {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  pet_name: string | null;
  pet_level: number;
  eligible: boolean;
}

export function useSearchArenaCandidates(query: string) {
  const { userId } = useCurrentUser();
  const q = query.trim();
  return useQuery({
    queryKey: ['arena-search', userId, q.toLowerCase()],
    enabled: !!userId && q.length >= 2,
    staleTime: 10_000,
    queryFn: async (): Promise<ArenaSearchResult[]> => {
      const like = `%${q}%`;
      const { data: profiles, error } = await supabase
        .from('public_profiles' as never)
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .neq('id', userId!)
        .limit(20);
      if (error) throw error;
      const list = (profiles ?? []) as any[];
      if (list.length === 0) return [];
      const ids = list.map(p => p.id);
      const { data: pets } = await supabase
        .from('pet_arena_public' as never)
        .select('user_id, name, level, risk_tier')
        .in('user_id', ids);
      const pmap = new Map((pets ?? []).map((p: any) => [p.user_id, p]));
      return list.map(p => {
        const pet = pmap.get(p.id) as any;
        const eligible = !!pet && pet.level >= 1 && pet.risk_tier !== 'frozen';
        return {
          user_id: p.id,
          display_name: p.display_name,
          username: p.username,
          avatar_url: p.avatar_url,
          pet_name: pet?.name ?? null,
          pet_level: pet?.level ?? 0,
          eligible,
        };
      });
    },
  });
}

export interface LeaderboardRow {
  user_id: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export function useBattleLeaderboard(limit = 50) {
  return useQuery({
    queryKey: ['pet-battle-leaderboard'],
    staleTime: 30_000,
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data: season } = await supabase
        .from('pet_battle_seasons' as never)
        .select('id')
        .eq('is_current', true)
        .maybeSingle();
      if (!season) return [];

      const { data, error } = await supabase
        .from('pet_battle_leaderboard' as never)
        .select('user_id, wins, losses, draws, points')
        .eq('season_id', (season as any).id)
        .order('points', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const ids = (data ?? []).map((d: any) => d.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from('public_profiles' as never)
        .select('id, username, display_name, avatar_url')
        .in('id', ids);
      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((d: any) => ({
        ...d,
        display_name: pmap.get(d.user_id)?.display_name ?? null,
        username: pmap.get(d.user_id)?.username ?? null,
        avatar_url: pmap.get(d.user_id)?.avatar_url ?? null,
      }));
    },
  });
}
