import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PetMood } from './usePetState';

export interface PetVoiceLine {
  id: string;
  text_vi: string;
  text_en: string;
  audio_url: string | null;
}

export function usePetVoiceLine() {
  return useCallback(async (mood: PetMood, trigger: string): Promise<PetVoiceLine | null> => {
    const { data, error } = await supabase
      .from('pet_voice_lines' as never)
      .select('id, text_vi, text_en, audio_url')
      .eq('mood', mood)
      .eq('trigger_event', trigger)
      .eq('is_active', true);
    if (error || !data || data.length === 0) return null;
    const arr = data as unknown as PetVoiceLine[];
    return arr[Math.floor(Math.random() * arr.length)];
  }, []);
}
