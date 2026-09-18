import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TreasurySource = 'pet' | 'mystery';

export interface TreasuryInflowRow {
  uid: string;
  source: TreasurySource;
  confirmed_at: string;
  user_id: string;
  item: string;
  price_camly: number;
  tx_hash: string | null;
  // enriched
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function useTreasuryPublicInflows(limit = 100) {
  const qc = useQueryClient();

  // Realtime: bất kỳ đơn nào confirmed → refetch
  useEffect(() => {
    const channelId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const ch = supabase
      .channel(`treasury-public-inflows-${channelId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pet_shop_orders', filter: 'status=eq.confirmed' },
        () => qc.invalidateQueries({ queryKey: ['treasury-public-inflows'] }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mystery_box_orders', filter: 'status=eq.confirmed' },
        () => qc.invalidateQueries({ queryKey: ['treasury-public-inflows'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return useQuery({
    queryKey: ['treasury-public-inflows', limit],
    staleTime: 30_000,
    queryFn: async (): Promise<TreasuryInflowRow[]> => {
      const [petRes, mbRes] = await Promise.all([
        supabase
          .from('pet_shop_orders_public' as never)
          .select('id, user_id, price_camly, tx_hash, confirmed_at, cosmetic_name_vi, cosmetic_slug')
          .order('confirmed_at', { ascending: false })
          .limit(limit),
        supabase
          .from('mystery_box_orders_public' as never)
          .select('id, user_id, price_camly, tx_hash, confirmed_at, box_name_vi, box_code')
          .order('confirmed_at', { ascending: false })
          .limit(limit),
      ]);

      const rows: TreasuryInflowRow[] = [];
      ((petRes.data ?? []) as any[]).forEach((r) => {
        rows.push({
          uid: `pet-${r.id}`,
          source: 'pet',
          confirmed_at: r.confirmed_at,
          user_id: r.user_id,
          item: r.cosmetic_name_vi || r.cosmetic_slug || '—',
          price_camly: Number(r.price_camly),
          tx_hash: r.tx_hash,
          username: null,
          display_name: null,
          avatar_url: null,
        });
      });
      ((mbRes.data ?? []) as any[]).forEach((r) => {
        rows.push({
          uid: `mb-${r.id}`,
          source: 'mystery',
          confirmed_at: r.confirmed_at,
          user_id: r.user_id,
          item: r.box_name_vi || r.box_code || '—',
          price_camly: Number(r.price_camly),
          tx_hash: r.tx_hash,
          username: null,
          display_name: null,
          avatar_url: null,
        });
      });

      // Enrich profile
      const ids = Array.from(new Set(rows.map((r) => r.user_id))).filter(Boolean);
      if (ids.length) {
        const { data: profs } = await supabase
          .from('public_profiles' as never)
          .select('id, username, display_name, avatar_url')
          .in('id', ids);
        const map = new Map<string, any>(
          ((profs ?? []) as any[]).map((p) => [p.id, p]),
        );
        rows.forEach((r) => {
          const p = map.get(r.user_id);
          if (p) {
            r.username = p.username ?? null;
            r.display_name = p.display_name ?? null;
            r.avatar_url = p.avatar_url ?? null;
          }
        });
      }

      rows.sort((a, b) => (b.confirmed_at || '').localeCompare(a.confirmed_at || ''));
      return rows.slice(0, limit);
    },
  });
}
