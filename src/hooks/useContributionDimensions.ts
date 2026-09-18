import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Contribution Dimensions — kiến trúc tổng quát cho các dimension đóng góp
 * (ecosystem, future NFT/Badges/Reputation...) hoàn toàn TÁCH BIỆT với
 * USD Ranking. Không import từ useBenefactorLeaderboard.
 *
 * Nguồn: RPC generic `get_contribution_dimension_stats` + `get_token_leaderboard`.
 */

export type TimeRange = 'day' | 'week' | 'month' | 'all';
export type Direction = 'sent' | 'received';

export interface DimensionTokenStats {
  token_symbol: string;
  token_icon: string | null;
  token_decimals: number;
  ranking_dimension: string;
  total_sent: number;
  total_received: number;
  transactions: number;
  unique_participants: number;
  unique_senders: number;
  unique_recipients: number;
}

export interface TokenLeaderboardEntry {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  full_name: string | null;
  token_symbol: string;
  token_icon: string | null;
  token_decimals: number;
  ranking_dimension: string;
  total_amount: number;
  total_amount_usd: number;
  total_transactions: number;
  rank: number;
}

export function useContributionDimensionStats(
  dimension: string = 'ecosystem',
  timeRange: TimeRange = 'all',
) {
  return useQuery({
    queryKey: ['contribution-dimension-stats', dimension, timeRange],
    queryFn: async (): Promise<DimensionTokenStats[]> => {
      const { data, error } = await supabase.rpc('get_contribution_dimension_stats', {
        p_dimension: dimension,
        p_time_range: timeRange,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        token_symbol: r.token_symbol,
        token_icon: r.token_icon,
        token_decimals: Number(r.token_decimals ?? 0),
        ranking_dimension: r.ranking_dimension,
        total_sent: Number(r.total_sent ?? 0),
        total_received: Number(r.total_received ?? 0),
        transactions: Number(r.transactions ?? 0),
        unique_participants: Number(r.unique_participants ?? 0),
        unique_senders: Number(r.unique_senders ?? 0),
        unique_recipients: Number(r.unique_recipients ?? 0),
      }));
    },
    staleTime: 60 * 1000,
  });
}

interface UseTokenLeaderboardOpts {
  tokenSymbol: string;
  direction: Direction;
  timeRange?: TimeRange;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

export function useTokenLeaderboard({
  tokenSymbol,
  direction,
  timeRange = 'all',
  limit = 5,
  offset = 0,
  enabled = true,
}: UseTokenLeaderboardOpts) {
  return useQuery({
    queryKey: ['token-leaderboard', tokenSymbol, direction, timeRange, limit, offset],
    queryFn: async (): Promise<TokenLeaderboardEntry[]> => {
      const { data, error } = await supabase.rpc('get_token_leaderboard', {
        p_token_symbol: tokenSymbol,
        p_direction: direction,
        p_time_range: timeRange,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        user_id: r.user_id,
        username: r.username,
        avatar_url: r.avatar_url,
        full_name: r.full_name,
        token_symbol: r.token_symbol,
        token_icon: r.token_icon,
        token_decimals: Number(r.token_decimals ?? 0),
        ranking_dimension: r.ranking_dimension,
        total_amount: Number(r.total_amount ?? 0),
        total_amount_usd: Number(r.total_amount_usd ?? 0),
        total_transactions: Number(r.total_transactions ?? 0),
        rank: Number(r.rank ?? 0),
      }));
    },
    staleTime: 60 * 1000,
    enabled: enabled && !!tokenSymbol,
  });
}
