import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UserRewardStats {
  postsCount: number;
  reactionsOnPosts: number;
  commentsOnPosts: number;
  sharesCount: number;
  friendsCount: number;
  livestreamsCount: number;
  totalReward: number;
  todayReward: number;
  claimedAmount: number;
  claimableAmount: number;
}

/**
 * Centralized reward calculation formula (Updated 2026-01-15)
 * CUTOFF DATE: 2026-01-15 (data trước đó không giới hạn)
 * 
 * ⚠️ QUAN TRỌNG: Chỉ GIỚI HẠN SỐ TIỀN THƯỞNG, KHÔNG giới hạn hành động của user!
 * User có thể đăng bài, comment, reaction... bao nhiêu tùy thích.
 * Chỉ có số tiền thưởng được tính tối đa theo giới hạn bên dưới.
 * 
 * NEW USER BONUS: 50,000 CAMLY (1 lần duy nhất)
 * 
 * DAILY REWARD LIMITS (từ 2026-01-15) - Chỉ giới hạn thưởng, không giới hạn hành động:
 * - Posts: 5,000 CAMLY/post, THƯỞNG TỐI ĐA 10 bài/ngày = 50,000/day
 * - Reactions received: 1,000 CAMLY/reaction, THƯỞNG TỐI ĐA 50/ngày = 50,000/day
 * - Comments received (>20 chars): 1,000 CAMLY/comment, THƯỞNG TỐI ĐA 50/ngày = 50,000/day
 * - Shares received: 1,000 CAMLY/share, THƯỞNG TỐI ĐA 10/ngày = 10,000/day
 * - Friends: 10,000 CAMLY/friend, THƯỞNG TỐI ĐA 10/ngày = 100,000/day
 * - Livestream (10-120 min): 20,000 CAMLY, THƯỞNG TỐI ĐA 5/ngày = 100,000/day
 * 
 * MAX DAILY REWARD: 360,000 CAMLY
 */
export const REWARD_CONFIG = {
  NEW_USER_BONUS: 50000,
  CUTOFF_DATE: '2026-01-15',
  DAILY_LIMITS: {
    posts: { reward: 5000, maxPerDay: 10, maxDaily: 50000 },
    reactions: { reward: 1000, maxPerDay: 50, maxDaily: 50000 },
    comments: { reward: 1000, maxPerDay: 50, maxDaily: 50000, minLength: 20 },
    shares: { reward: 1000, maxPerDay: 10, maxDaily: 10000 },
    friends: { reward: 10000, maxPerDay: 10, maxDaily: 100000 },
    livestreams: { reward: 20000, maxPerDay: 5, maxDaily: 100000, minMinutes: 10, maxMinutes: 120 },
  },
  MAX_DAILY_REWARD: 360000,
};

export const calculateReward = (
  postsCount: number,
  reactionsOnPosts: number,
  commentsOnPosts: number,
  sharesCount: number,
  friendsCount: number,
  livestreamsCount: number = 0
): number => {
  const newUserBonus = REWARD_CONFIG.NEW_USER_BONUS;
  const postsReward = postsCount * REWARD_CONFIG.DAILY_LIMITS.posts.reward;
  const reactionsReward = reactionsOnPosts * REWARD_CONFIG.DAILY_LIMITS.reactions.reward;
  const commentsReward = commentsOnPosts * REWARD_CONFIG.DAILY_LIMITS.comments.reward;
  const sharesReward = sharesCount * REWARD_CONFIG.DAILY_LIMITS.shares.reward;
  const friendsReward = friendsCount * REWARD_CONFIG.DAILY_LIMITS.friends.reward;
  const livestreamsReward = livestreamsCount * REWARD_CONFIG.DAILY_LIMITS.livestreams.reward;
  
  return newUserBonus + postsReward + reactionsReward + commentsReward + sharesReward + friendsReward + livestreamsReward;
};

/**
 * Fetch reward stats for a user - uses RPC function V2 with daily limits
 */
const fetchRewardStats = async (userId: string): Promise<UserRewardStats> => {
  // Use RPC function V2 with daily limits
  const [userRewardsRes, claimsRes] = await Promise.all([
    supabase.rpc('get_user_rewards_v2', { limit_count: 10000 }),
    supabase
      .from('reward_claims')
      .select('amount')
      .eq('user_id', userId)
  ]);

  // Find the current user's data from RPC result
  const userData = userRewardsRes.data?.find((u: any) => u.id === userId);
  
  const postsCount = Number(userData?.posts_count) || 0;
  const reactionsOnPosts = Number(userData?.reactions_on_posts) || 0;
  const commentsOnPosts = Number(userData?.comments_count) || 0;
  const sharesCount = Number(userData?.shares_count) || 0;
  const friendsCount = Number(userData?.friends_count) || 0;
  const livestreamsCount = Number(userData?.livestreams_count) || 0;
  const totalReward = Number(userData?.total_reward) || 0;
  const todayReward = Number(userData?.today_reward) || 0;
  
  const claimedAmount = claimsRes.data?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
  // Không cộng dồn: claimable chỉ dựa trên thưởng hôm nay
  const claimableAmount = Math.max(0, totalReward - claimedAmount);
  
  return {
    postsCount,
    reactionsOnPosts,
    commentsOnPosts,
    sharesCount,
    friendsCount,
    livestreamsCount,
    totalReward,
    todayReward,
    claimedAmount,
    claimableAmount
  };
};

/**
 * Hook to calculate user reward stats with React Query caching
 * - Caches data for 5 minutes (staleTime)
 * - Keeps data in cache for 10 minutes (gcTime)
 * - Auto-refetches when userId changes
 */
export const useRewardCalculation = (userId: string | null) => {
  const queryClient = useQueryClient();

  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ['reward-stats', userId],
    queryFn: () => fetchRewardStats(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache
    refetchOnWindowFocus: false,
  });

  // Invalidate cache when needed (e.g., after claiming rewards)
  const invalidateCache = () => {
    queryClient.invalidateQueries({ queryKey: ['reward-stats', userId] });
  };

  return { 
    stats: stats || null, 
    isLoading, 
    error: error as Error | null, 
    refetch,
    invalidateCache 
  };
};

export default useRewardCalculation;
