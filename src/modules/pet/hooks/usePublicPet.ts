import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PublicPetState {
  user_id: string;
  name: string;
  species: string;
  mood: string;
  level: number;
  evolution_stage: number;
  cheers_received_total: number;
  visible: boolean;
  equipped_skin_slug: string | null;
  equipped_frame_slug: string | null;
  equipped_hat_slug: string | null;
  equipped_aura_slug: string | null;
  equipped_accessory_slug: string | null;
}

export interface PetLeaderboardRow {
  user_id: string;
  name: string;
  evolution_stage: number;
  level: number;
  cheers_received_total: number;
  equipped_skin_slug: string | null;
}

export function usePublicPet(userId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['public-pet-state', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_pet_states' as never)
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as PublicPetState) || null;
    },
  });

  // Unique per hook instance so two components subscribed to the same userId
  // never share a channel topic. This happens in production whenever a
  // PetMiniBadge (which calls usePublicPet(userId)) opens its own
  // PetQuickViewDialog -> PublicPetCard (another usePublicPet(userId)) for the
  // same user: two live `public-pet-<userId>` channels. supabase-js then
  // rebinds postgres_changes on an already-joined channel and throws
  // "cannot add postgres_changes callbacks". Mirrors usePetState.ts.
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 9));
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`public-pet-${userId}-${instanceIdRef.current}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pet_states', filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['public-pet-state', userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return query;
}

export function usePetLeaderboard(limit = 50) {
  return useQuery({
    queryKey: ['pet-leaderboard', limit],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pet_leaderboard_top' as never, { _limit: limit } as never);
      if (error) throw error;
      return (data as unknown as PetLeaderboardRow[]) || [];
    },
  });
}

export function usePetCheer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { toUserId: string; message?: string }) => {
      const { data, error } = await supabase.rpc('pet_cheer' as never, {
        _to_user_id: payload.toUserId,
        _message: payload.message ?? null,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['public-pet-state', vars.toUserId] });
      qc.invalidateQueries({ queryKey: ['pet-leaderboard'] });
    },
  });
}

export function usePetRename() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (newName: string) => {
      const { data, error } = await supabase.rpc('pet_rename' as never, { _new_name: newName } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pet-state'] });
      qc.invalidateQueries({ queryKey: ['public-pet-state'] });
    },
  });
}

export function petErrorToMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message || '';
  if (msg.includes('CANNOT_CHEER_SELF')) return 'Bạn không thể cổ vũ Linh thú của chính mình.';
  if (msg.includes('ALREADY_CHEERED_TODAY')) return 'Bạn đã cổ vũ người này hôm nay rồi. Quay lại sau nhé!';
  if (msg.includes('MESSAGE_TOO_LONG')) return 'Lời nhắn tối đa 120 ký tự.';
  if (msg.includes('INVALID_LENGTH')) return 'Tên Linh thú từ 2 đến 20 ký tự.';
  if (msg.includes('BLOCKED_WORD')) return 'Tên này không được phép, vui lòng chọn tên khác.';
  if (msg.includes('RENAME_COOLDOWN')) return 'Bạn chỉ có thể đổi tên Linh thú mỗi 7 ngày một lần.';
  if (msg.includes('NOT_AUTHENTICATED')) return 'Vui lòng đăng nhập để thực hiện.';
  return msg || 'Đã có lỗi xảy ra';
}
