/**
 * B5 — Gift breakdown tổng hợp trên SERVER qua RPC `get_user_gift_breakdown`.
 * Không còn 3 query client + `.limit(10000)` + `.reduce()`.
 * Giá USD đi qua SSOT: `normalize_price_map` + `get_token_price_now`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTokenPrices } from '@/hooks/useTokenPrices';

export interface GiftBreakdownItem {
  token_symbol: string;
  count: number;
  total_amount: number;
  usd_value: number;
}

export interface GiftBreakdownResult {
  items: GiftBreakdownItem[];
  totalUsd: number;
  totalCount: number;
  unpricedItems: GiftBreakdownItem[];
  /** true = không có giá thị trường thật → không hiển thị tổng USD */
  pricesUnavailable: boolean;
}

interface RpcRow {
  token_symbol: string;
  cnt: number | string;
  total_amount: number | string;
  price_usd: number | string | null;
  usd_value: number | string | null;
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
};

export function useGiftBreakdown(userId: string | undefined, direction: 'sent' | 'received') {
  const { data: prices } = useTokenPrices();

  return useQuery<GiftBreakdownResult>({
    queryKey: ['gift-breakdown-v3', userId, direction, !!prices],
    enabled: !!userId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Bảng giá client (nếu có) chỉ là override; server tự chuẩn hoá + khử alias trùng.
      const priceMap: Record<string, number> = {};
      for (const [sym, v] of Object.entries(prices || {})) {
        const p = (v as { usd?: number })?.usd;
        if (typeof p === 'number' && p > 0) priceMap[sym.toUpperCase()] = p;
      }

      const { data, error } = await supabase.rpc('get_user_gift_breakdown', {
        p_user_id: userId!,
        p_direction: direction,
        p_prices: Object.keys(priceMap).length ? priceMap : null,
      });
      if (error) throw error;

      const rows = (data || []) as unknown as RpcRow[];
      const items: GiftBreakdownItem[] = [];
      const unpricedItems: GiftBreakdownItem[] = [];
      let totalUsd = 0;
      let totalCount = 0;

      for (const r of rows) {
        const item: GiftBreakdownItem = {
          token_symbol: r.token_symbol,
          count: num(r.cnt),
          total_amount: num(r.total_amount),
          usd_value: r.price_usd == null ? 0 : num(r.usd_value),
        };
        totalCount += item.count;
        if (r.price_usd == null || item.usd_value <= 0) {
          unpricedItems.push(item);
        } else {
          items.push(item);
          totalUsd += item.usd_value;
        }
      }

      items.sort((a, b) => b.usd_value - a.usd_value || b.count - a.count);
      unpricedItems.sort((a, b) => b.total_amount - a.total_amount);

      const pricesUnavailable = rows.length > 0 && items.length === 0;
      return { items, totalUsd, totalCount, unpricedItems, pricesUnavailable };
    },
  });
}
