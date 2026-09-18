import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BoxInventoryItem, BoxDefinition, BoxRewardPayload } from '../types';
import { useEffect, useState } from 'react';

function useUserId() {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUid(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return uid;
}

export function useMysteryBoxInventory() {
  const userId = useUserId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['mystery-box-inventory', userId],
    enabled: !!userId,
    queryFn: async (): Promise<BoxInventoryItem[]> => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> } } } })
        .from('mystery_box_inventory')
        .select('*, definition:mystery_box_definitions(*)')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BoxInventoryItem[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`mb-inv-${userId}`)
      .on('postgres_changes' as never,
        { event: '*', schema: 'public', table: 'mystery_box_inventory', filter: `user_id=eq.${userId}` } as never,
        () => qc.invalidateQueries({ queryKey: ['mystery-box-inventory', userId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  return query;
}

export function useMysteryBoxDefinitions() {
  return useQuery({
    queryKey: ['mystery-box-definitions'],
    queryFn: async (): Promise<BoxDefinition[]> => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: boolean) => { order: (c: string) => Promise<{ data: unknown; error: unknown }> } } } })
        .from('mystery_box_definitions')
        .select('*')
        .eq('is_active', true)
        .order('tier');
      if (error) throw error;
      return (data ?? []) as BoxDefinition[];
    },
  });
}

export function useOpenMysteryBox() {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: async (inventoryId: string): Promise<BoxRewardPayload> => {
      const { data, error } = await supabase.rpc('mystery_box_open' as never, { _inventory_id: inventoryId } as never);
      if (error) throw error;
      return data as unknown as BoxRewardPayload;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['mystery-box-inventory', userId] });
      qc.invalidateQueries({ queryKey: ['pet-cosmetics', userId] });
      qc.invalidateQueries({ queryKey: ['pet-state', userId] });
      try {
        const rarity = (data as { rarity?: string; reward?: { rarity?: string } } | null)?.rarity
          ?? (data as { reward?: { rarity?: string } } | null)?.reward?.rarity
          ?? 'common';
        window.dispatchEvent(new CustomEvent('pet-box-opened', { detail: { rarity } }));
      } catch {
        /* no-op */
      }
    },
  });
}

export function usePurchaseMysteryBox() {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: async (boxCode: string): Promise<string> => {
      const { data, error } = await supabase.rpc('mystery_box_purchase' as never, { _box_code: boxCode } as never);
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mystery-box-inventory', userId] }),
  });
}
