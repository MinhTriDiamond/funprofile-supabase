import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from 'sonner';

export type CosmeticSlot = 'hat' | 'aura' | 'background' | 'accessory' | 'skin';
export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'cosmic';

export interface PetCosmeticCatalog {
  id: string;
  slug: string;
  name_vi: string;
  name_en: string;
  slot: CosmeticSlot;
  rarity: CosmeticRarity;
  sprite_url: string | null;
  description_vi: string | null;
  description_en: string | null;
  unlock_condition: string | null;
  is_active: boolean;
}

export interface PetCosmeticOwned {
  id: string;
  user_id: string;
  cosmetic_id: string;
  source: string;
  equipped: boolean;
  acquired_at: string;
  catalog: PetCosmeticCatalog;
}

export function usePetCosmetics() {
  const { userId } = useCurrentUser();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['pet-cosmetics', userId],
    queryFn: async (): Promise<PetCosmeticOwned[]> => {
      const { data, error } = await supabase
        .from('pet_cosmetics_owned' as never)
        .select('*, catalog:pet_cosmetics_catalog(*)')
        .eq('user_id', userId!)
        .order('acquired_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PetCosmeticOwned[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const equip = useMutation({
    mutationFn: async (cosmeticId: string) => {
      const { error } = await supabase.rpc('pet_equip_cosmetic' as never, { _cosmetic_id: cosmeticId } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pet-cosmetics', userId] });
      toast.success('Đã trang bị cho Lumi');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unequip = useMutation({
    mutationFn: async (cosmeticId: string) => {
      const { error } = await supabase.rpc('pet_unequip_cosmetic' as never, { _cosmetic_id: cosmeticId } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pet-cosmetics', userId] });
      toast.success('Đã tháo trang phục');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...list, equip, unequip };
}
