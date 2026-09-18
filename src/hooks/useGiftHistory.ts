import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getTodayVN, vnDateToUtcRange } from '@/lib/vnTimezone';
import { getGiftTokenLabel } from '@/lib/giftTokenLabel';

// Token totals per day per display label (label kèm chain khi cần, ví dụ "BNB (BSC Testnet)")
export interface DayTokenTotals {
  [label: string]: { amount: number; count: number };
}

// Fetch gift counts per day using database function (bypasses 1000 row limit)
const fetchGiftDayCounts = async (): Promise<Record<string, number>> => {
  const { data, error } = await supabase.rpc('get_gift_day_counts');

  if (error) {
    console.error('Gift day counts error:', error);
    return {};
  }

  const counts: Record<string, number> = {};
  (data || []).forEach((row: any) => {
    counts[row.vn_date] = Number(row.gift_count) || 0;
  });
  return counts;
};

// Fetch token totals per day
const fetchGiftDayTokenTotals = async (): Promise<Record<string, DayTokenTotals>> => {
  const { data, error } = await supabase.rpc('get_gift_day_token_totals');

  if (error) {
    console.error('Gift day token totals error:', error);
    return {};
  }

  const result: Record<string, DayTokenTotals> = {};
  (data || []).forEach((row: any) => {
    const dateStr = row.vn_date;
    if (!result[dateStr]) result[dateStr] = {};
    const label = getGiftTokenLabel(row.token_symbol, row.chain_id);
    const amount = Number(row.total_amount) || 0;
    const count = Number(row.tx_count) || 0;
    const cur = result[dateStr][label];
    if (cur) {
      cur.amount += amount;
      cur.count += count;
    } else {
      result[dateStr][label] = { amount, count };
    }
  });
  return result;
};

// Fetch gift posts for a specific VN date
const fetchGiftPostsByDate = async (dateStr: string) => {
  const { start, end } = vnDateToUtcRange(dateStr);

  const { data, error } = await supabase
    .from('posts')
    .select(`*, public_profiles!posts_user_id_fkey (username, display_name, avatar_url, public_wallet_address, is_banned)`)
    .eq('post_type', 'gift_celebration')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('Gift posts by date error:', error);
    return [];
  }

  return (data || []).map((post: any) => ({
    ...post,
    profiles: post.public_profiles,
    media_urls: post.media_urls || null,
    visibility: post.visibility || 'public',
  })).filter((p: any) => !p.profiles?.is_banned);
};

// Fetch stats for history posts
const fetchHistoryPostStats = async (postIds: string[]) => {
  if (postIds.length === 0) return {};
  try {
    const { data, error } = await supabase.rpc('get_post_stats', { p_post_ids: postIds });
    if (error) throw error;
    const stats: Record<string, any> = {};
    (data || []).forEach((row: any) => {
      const reactions = Array.isArray(row.reactions) ? row.reactions : [];
      stats[row.post_id] = {
        reactions: reactions.map((r: any) => ({ id: r.id, user_id: r.user_id, type: r.type })),
        commentCount: Number(row.comment_count) || 0,
        shareCount: Number(row.share_count) || 0,
      };
    });
    postIds.forEach(id => {
      if (!stats[id]) stats[id] = { reactions: [], commentCount: 0, shareCount: 0 };
    });
    return stats;
  } catch {
    return postIds.reduce((acc, id) => ({ ...acc, [id]: { reactions: [], commentCount: 0, shareCount: 0 } }), {});
  }
};

// Fetch donation count for a specific VN date from donations table (source of truth)
// LOẠI ví ngoài: chỉ tính giao dịch nội bộ fun.rich (sender_id NOT NULL, is_external NOT TRUE)
const fetchDonationCountByDate = async (dateStr: string): Promise<number> => {
  const { start, end } = vnDateToUtcRange(dateStr);
  const { count, error } = await supabase
    .from('donations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .not('is_external', 'is', true)
    .not('sender_id', 'is', null)
    .gte('created_at', start)
    .lt('created_at', end);

  if (error) {
    console.error('Donation count error:', error);
    return 0;
  }
  return count || 0;
};

// Find latest date with gifts in last 7 days
const findLatestDateWithGifts = (dateCounts: Record<string, number>): string | null => {
  const today = getTodayVN();
  for (let i = 0; i < 7; i++) {
    const d = new Date(new Date(today + 'T00:00:00Z').getTime() - i * 86400000);
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    if ((dateCounts[dateStr] || 0) > 0) return dateStr;
  }
  return null;
};

export const useGiftHistory = (selectedDate: string | null) => {
  const today = getTodayVN();
  const isToday = !selectedDate || selectedDate === today;
  const activeDate = selectedDate || today;

  const dayCountsQuery = useQuery({
    queryKey: ['gift-day-counts'],
    queryFn: fetchGiftDayCounts,
    staleTime: 10 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 20 * 1000,
    refetchIntervalInBackground: false,
  });

  const dayTokenTotalsQuery = useQuery({
    queryKey: ['gift-day-token-totals'],
    queryFn: fetchGiftDayTokenTotals,
    staleTime: 10 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
  });

  const historyQuery = useQuery({
    queryKey: ['gift-history-posts', selectedDate],
    queryFn: async () => {
      if (!selectedDate || isToday) return { posts: [], postStats: {} };
      const posts = await fetchGiftPostsByDate(selectedDate);
      const postIds = posts.map((p: any) => p.id);
      const postStats = await fetchHistoryPostStats(postIds);
      return { posts, postStats };
    },
    enabled: !isToday && !!selectedDate,
    staleTime: 30 * 1000,
  });

  // Compute the latest date that has gifts (for auto-fallback)
  const latestDateWithGifts = findLatestDateWithGifts(dayCountsQuery.data || {});

  return {
    dateCounts: dayCountsQuery.data || {},
    dateTokenTotals: dayTokenTotalsQuery.data || {},
    historyPosts: historyQuery.data?.posts || [],
    historyPostStats: historyQuery.data?.postStats || {},
    isLoadingHistory: historyQuery.isLoading,
    isLoadingDayCounts: dayCountsQuery.isLoading,
    isToday,
    todayVN: today,
    latestDateWithGifts,
  };
};

export { getTodayVN };
