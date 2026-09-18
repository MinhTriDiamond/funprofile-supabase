import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export type PetMood = 'happy' | 'calm' | 'sad' | 'excited' | 'sleepy' | 'hungry';

export interface PetState {
  user_id: string;
  name: string;
  species: string;
  mood: PetMood;
  level: number;
  xp: number;
  evolution_stage: number;
  voice_enabled: boolean;
  visible: boolean;
  last_interaction_at: string;
  updated_at: string;
}

async function fetchPetState(userId: string): Promise<PetState | null> {
  const { data, error } = await supabase
    .from('pet_states' as never)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as unknown as PetState;

  // Auto-create on first access
  const { data: created, error: createError } = await supabase
    .from('pet_states' as never)
    .insert({ user_id: userId } as never)
    .select()
    .single();
  if (createError) throw createError;
  return created as unknown as PetState;
}

export function usePetState() {
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['pet-state', userId],
    queryFn: () => fetchPetState(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });

  // Realtime: pet_states updated by RPC from edge functions
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 9));
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`pet-state-${userId}-${instanceIdRef.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pet_states', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new) {
            queryClient.setQueryData(['pet-state', userId], payload.new as PetState);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, queryClient]);

  return query;
}

export async function updatePetSettings(userId: string, patch: Partial<Pick<PetState, 'name' | 'voice_enabled' | 'visible'>>) {
  const { error } = await supabase
    .from('pet_states' as never)
    .update(patch as never)
    .eq('user_id', userId);
  if (error) throw error;
}
