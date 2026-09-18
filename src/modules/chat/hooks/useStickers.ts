
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Sticker, StickerPack } from '../types';

export function useStickers() {
  const packsQuery = useQuery({
    queryKey: ['chat-sticker-packs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sticker_packs')
        .select('id, name, description, preview_url, is_free, is_active, sort_order, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as StickerPack[];
    },
    staleTime: 60 * 1000,
  });

  const stickersQuery = useQuery({
    queryKey: ['chat-stickers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stickers')
        .select('id, pack_id, name, url, is_animated, sort_order')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as Sticker[];
    },
    staleTime: 60 * 1000,
  });

  const packs = packsQuery.data || [];
  const stickers = stickersQuery.data || [];

  const stickersByPack = new Map<string, Sticker[]>();
  for (const s of stickers) {
    const arr = stickersByPack.get(s.pack_id) || [];
    arr.push(s);
    stickersByPack.set(s.pack_id, arr);
  }

  return {
    packs,
    stickersByPack,
    isLoading: packsQuery.isLoading || stickersQuery.isLoading,
    error: packsQuery.error || stickersQuery.error,
  };
}
