import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BenefactorEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  full_name: string | null;
  totals_by_token: TokenTotals;
  total_donated_usd: number;
  total_donations: number;
  total_light_score: number;
  rank: number;
}

export type TokenTotals = Record<string, {
  amount: number;
  usd: number;
  transactions: number;
}>;

export interface RecipientEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  full_name: string | null;
  totals_by_token: TokenTotals;
  total_received_usd: number;
  total_donations: number;
  rank: number;
}

export interface UserDonationStats {
  total_sent: number;
  total_received: number;
  donations_sent: number;
  donations_received: number;
  light_score_from_donations: number;
  unique_recipients: number;
  unique_donors: number;
}

interface UseBenefactorLeaderboardOptions {
  limit?: number;
  offset?: number;
  timeRange?: 'day' | 'week' | 'month' | 'all';
  tokenSymbol?: string;
}

export function useBenefactorLeaderboard(options: UseBenefactorLeaderboardOptions = {}) {
  const { limit = 50, offset = 0, timeRange = 'all', tokenSymbol } = options;

  return useQuery({
    queryKey: ['benefactor-leaderboard', limit, offset, timeRange, tokenSymbol],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_benefactor_leaderboard', {
        p_limit: limit,
        p_offset: offset,
        p_time_range: timeRange,
        p_token_symbol: tokenSymbol || null,
      });

      if (error) {
        console.error('Error fetching benefactor leaderboard:', error);
        throw error;
      }

      return ((data || []) as any[]).map((r) => ({
        user_id: r.user_id,
        username: r.username,
        avatar_url: r.avatar_url,
        full_name: r.full_name,
        totals_by_token: (r.totals_by_token || {}) as unknown as TokenTotals,
        total_donated_usd: Number(r.total_amount_usd ?? 0),
        total_donations: Number(r.total_transactions ?? 0),
        total_light_score: Number(r.total_light_score ?? 0),
        rank: Number(r.rank ?? 0),
      })) as BenefactorEntry[];
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useRecipientLeaderboard(options: UseBenefactorLeaderboardOptions = {}) {
  const { limit = 50, offset = 0, timeRange = 'all', tokenSymbol } = options;

  return useQuery({
    queryKey: ['recipient-leaderboard', limit, offset, timeRange, tokenSymbol],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_recipient_leaderboard', {
        p_limit: limit,
        p_offset: offset,
        p_time_range: timeRange,
        p_token_symbol: tokenSymbol || null,
      });

      if (error) {
        console.error('Error fetching recipient leaderboard:', error);
        throw error;
      }

      return ((data || []) as any[]).map((r) => ({
        user_id: r.user_id,
        username: r.username,
        avatar_url: r.avatar_url,
        full_name: r.full_name,
        totals_by_token: (r.totals_by_token || {}) as unknown as TokenTotals,
        total_received_usd: Number(r.total_amount_usd ?? 0),
        total_donations: Number(r.total_transactions ?? 0),
        rank: Number(r.rank ?? 0),
      })) as RecipientEntry[];
    },
    staleTime: 60 * 1000,
  });
}

export function useUserDonationStats(userId: string | null) {
  return useQuery({
    queryKey: ['user-donation-stats', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase.rpc('get_user_donation_stats', {
        p_user_id: userId,
      });

      if (error) {
        console.error('Error fetching user donation stats:', error);
        throw error;
      }

      return data?.[0] as UserDonationStats | null;
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

export function useDonationHistory(userId: string | null, type: 'sent' | 'received' | 'all' = 'all') {
  return useQuery({
    queryKey: ['donation-history', userId, type],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase.rpc('get_donation_history', {
        p_user_id: userId,
        p_type: type,
        p_limit: 50,
        p_offset: 0,
      });

      if (error) {
        console.error('Error fetching donation history:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}
