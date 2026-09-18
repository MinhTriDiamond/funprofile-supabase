import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PriceData {
  [key: string]: {
    usd: number;
    usd_24h_change: number;
  };
}

const CACHE_KEY = 'fun_token_prices';
const CACHE_TTL = 5 * 60_000; // 5 minutes

function readCache(): PriceData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { prices, ts } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL && prices) return prices;
  } catch { /* ignore */ }
  return null;
}

function writeCache(prices: PriceData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ prices, ts: Date.now() }));
  } catch { /* quota exceeded */ }
}

async function fetchTokenPrices(): Promise<PriceData> {
  // Check localStorage cache first (shared across tabs)
  const cached = readCache();
  if (cached) return cached;

  const { data, error } = await supabase.functions.invoke('token-prices');
  if (error) throw error;
  const prices: PriceData | undefined = data?.prices;
  // Không bao giờ bơm giá bịa: không có giá thật → báo lỗi rõ ràng
  if (!prices || Object.keys(prices).length === 0) {
    throw new Error('PRICE_SOURCE_UNAVAILABLE');
  }
  writeCache(prices);
  return prices;
}

/**
 * Centralized token prices hook using React Query.
 * All components share a single query — no duplicate edge function calls.
 * staleTime = 10 min, refetch interval = 5 min.
 */
export function useTokenPrices() {
  return useQuery<PriceData>({
    queryKey: ['token-prices'],
    queryFn: fetchTokenPrices,
    staleTime: 10 * 60_000, // 10 minutes
    gcTime: 15 * 60_000,
    refetchInterval: 5 * 60_000, // 5 minutes
    refetchIntervalInBackground: false,
    placeholderData: () => readCache() ?? undefined,
    retry: 2,
  });
}
