/**
 * useAccountCapabilities — Centralized capability layer for account permissions
 * 
 * Wallet-first accounts with account_status='limited' (chưa verify email):
 * - canViewContent = true
 * - canCreatePost / canComment / canReact / canChat = false
 * - canAccrueRewards = true
 * - canExtractRewards = false
 * 
 * Active accounts (email verified):
 * - All capabilities = true (trừ khi bị ban)
 */

import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/integrations/supabase/client';

interface AccountCapData {
  reward_locked: boolean | null;
  signup_method: string | null;
  account_status: string | null;
  is_banned: boolean | null;
}

export interface AccountCapabilities {
  /** Luôn true — ai cũng được xem */
  canViewContent: boolean;
  /** Chỉ active account */
  canCreatePost: boolean;
  /** Chỉ active account */
  canComment: boolean;
  /** Chỉ active account */
  canReact: boolean;
  /** Chỉ active account */
  canChat: boolean;
  /** Luôn true — cho phép tích lũy nội bộ */
  canAccrueRewards: boolean;
  /** Cho phép claim/mint/withdraw */
  canExtractRewards: boolean;
  /** Account được tạo bằng wallet-first flow */
  isWalletFirstAccount: boolean;
  /** Account đang ở trạng thái giới hạn */
  isLimitedAccount: boolean;
  /** Lý do bị khóa */
  limitedReason: 'email_not_verified' | 'banned' | null;
  isLoading: boolean;
}

export function useAccountCapabilities(): AccountCapabilities {
  const { userId, isLoading: userLoading } = useCurrentUser();

  const { data, isLoading: queryLoading } = useQuery({
    queryKey: ['account-capabilities', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('reward_locked, signup_method, account_status, is_banned')
        .eq('id', userId!)
        .single();
      return data as AccountCapData | null;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const rewardLocked = data?.reward_locked ?? false;
  const signupMethod = data?.signup_method ?? 'email';
  const accountStatus = data?.account_status ?? 'active';
  const isBanned = data?.is_banned ?? false;

  const isActive = accountStatus === 'active' && !isBanned;

  return {
    canViewContent: true,
    canCreatePost: isActive,
    canComment: isActive,
    canReact: isActive,
    canChat: isActive,
    canAccrueRewards: true,
    canExtractRewards: !rewardLocked && isActive,
    isWalletFirstAccount: signupMethod === 'wallet',
    isLimitedAccount: accountStatus === 'limited',
    limitedReason: isBanned ? 'banned' : (accountStatus === 'limited' ? 'email_not_verified' : null),
    isLoading: userLoading || queryLoading,
  };
}

// Re-export for backward compatibility
export { useAccountCapabilities as useRewardGating };
