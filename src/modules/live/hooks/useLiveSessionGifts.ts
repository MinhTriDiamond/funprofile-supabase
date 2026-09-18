import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LiveGiftSummary {
  count: number;
  byToken: Array<{ symbol: string; amount: number }>;
}

/**
 * Đếm và tổng hợp quà (donations nội bộ) gắn với post replay của phiên live.
 * Loại ví ngoài để giữ ý nghĩa "quà từ cộng đồng fun.rich".
 */
export function useLiveSessionGifts(postId: string | null | undefined, enabled = true) {
  return useQuery<LiveGiftSummary>({
    queryKey: ['live-session-gifts', postId],
    enabled: !!postId && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      if (!postId) return { count: 0, byToken: [] };
      const { data, error } = await supabase
        .from('donations')
        .select('token_symbol, amount, status, is_external, sender_id')
        .eq('post_id', postId)
        .eq('status', 'confirmed')
        .not('is_external', 'is', true)
        .not('sender_id', 'is', null);
      if (error) throw error;
      const rows = (data || []) as Array<{ token_symbol: string | null; amount: number | string | null }>;
      const bucket = new Map<string, number>();
      for (const r of rows) {
        const sym = (r.token_symbol || 'TOKEN').toUpperCase();
        const amt = typeof r.amount === 'string' ? parseFloat(r.amount) : (r.amount ?? 0);
        bucket.set(sym, (bucket.get(sym) || 0) + (isFinite(amt) ? amt : 0));
      }
      return {
        count: rows.length,
        byToken: Array.from(bucket.entries()).map(([symbol, amount]) => ({ symbol, amount })),
      };
    },
  });
}
