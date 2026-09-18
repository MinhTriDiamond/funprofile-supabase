/**
 * useLoginMethods — Hook for determining user's login methods and security level
 * 
 * Source of truth: supabase.auth.getUser() (force refetch on mount)
 * onAuthStateChange is bonus for reactivity.
 * 
 * Note: external_wallet_address is a Phase 1 pragmatic flag for wallet-linked login capability,
 * NOT a long-term identity mapping model.
 */

import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/integrations/supabase/client';

interface ProfileSecurityData {
  has_password: boolean | null;
  external_wallet_address: string | null;
  public_wallet_address: string | null;
  wallet_address: string | null;
  login_wallet_address: string | null;
  signup_method: string | null;
  reward_locked: boolean | null;
  account_status: string | null;
}

export const TOTAL_METHODS = 4;

export type SecurityLevel = 'basic' | 'good' | 'strong';

export type RecommendedAction =
  | 'set_password'
  | 'link_email'
  | 'verify_email'
  | 'link_wallet'
  | null;

export interface LoginMethodsResult {
  // Email
  emailExists: boolean;
  emailVerified: boolean;
  hasEmailLoginMethod: boolean;
  // Google
  hasGoogleIdentity: boolean;
  // Password
  hasPassword: boolean;
  // Wallet
  hasWalletLoginMethod: boolean;
  hasPublicWalletAddress: boolean;
  // Wallet-first account fields
  rewardLocked: boolean;
  signupMethod: string;
  accountStatus: string;
  // Aggregated
  activeMethodCount: number;
  securityLevel: SecurityLevel;
  recommendedAction: RecommendedAction;
  isFullySecured: boolean;
  isLoading: boolean;
}

export function useLoginMethods(): LoginMethodsResult {
  const { user, userId, isLoading: userLoading } = useCurrentUser();

  // Force refetch fresh auth user on mount for email_confirmed_at accuracy
  const { data: freshUser } = useQuery({
    queryKey: ['fresh-auth-user', userId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    enabled: !!userId,
    staleTime: 0, // always refetch
    gcTime: 5 * 60 * 1000,
  });

  // Fetch profile security data
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['profile-security', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('has_password, external_wallet_address, public_wallet_address, wallet_address, login_wallet_address, signup_method, reward_locked, account_status')
        .eq('id', userId!)
        .single();
      return data as ProfileSecurityData | null;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const authUser = freshUser ?? user;

  // Email placeholder patterns (system-generated, not real user emails)
  const isPlaceholderEmail = (email?: string | null) => {
    if (!email) return true;
    return email.endsWith('@wallet.fun.rich') || email.endsWith('@fun.phone') || email.endsWith('@internal.fun.local');
  };

  // Email states
  const emailExists = !!authUser?.email && !isPlaceholderEmail(authUser.email);
  const emailVerified = emailExists && !!authUser?.email_confirmed_at;
  const hasEmailLoginMethod = emailExists && emailVerified;

  // Google
  const providers = authUser?.app_metadata?.providers as string[] | undefined;
  const hasGoogleIdentity = providers?.includes('google') ?? false;

  // Password
  const hasPassword = profileData?.has_password ?? false;

  // Wallet
  const hasWalletLoginMethod = !!(
    profileData?.external_wallet_address ||
    profileData?.wallet_address ||
    profileData?.public_wallet_address ||
    profileData?.login_wallet_address
  );
  const hasPublicWalletAddress = !!profileData?.public_wallet_address;

  // Wallet-first account fields
  const rewardLocked = profileData?.reward_locked ?? false;
  const signupMethod = profileData?.signup_method ?? 'email';
  const accountStatus = profileData?.account_status ?? 'active';

  // Security level — only count ACTIVE methods
  let activeMethodCount = 0;
  if (hasEmailLoginMethod) activeMethodCount++;
  if (hasPassword) activeMethodCount++;
  if (hasWalletLoginMethod) activeMethodCount++;
  if (hasGoogleIdentity) activeMethodCount++;

  const securityLevel: SecurityLevel =
    activeMethodCount >= 3 ? 'strong' : activeMethodCount >= 2 ? 'good' : 'basic';

  // Recommended action — single priority
  let recommendedAction: RecommendedAction = null;
  if (!emailExists) {
    recommendedAction = 'link_email';
  } else if (!emailVerified) {
    recommendedAction = 'verify_email';
  } else if (!hasPassword) {
    recommendedAction = 'set_password';
  } else if (!hasWalletLoginMethod) {
    recommendedAction = 'link_wallet';
  }

  const isFullySecured =
    hasEmailLoginMethod && hasPassword && hasWalletLoginMethod && hasGoogleIdentity;

  return {
    emailExists,
    emailVerified,
    hasEmailLoginMethod,
    hasGoogleIdentity,
    hasPassword,
    hasWalletLoginMethod,
    hasPublicWalletAddress,
    rewardLocked,
    signupMethod,
    accountStatus,
    activeMethodCount,
    securityLevel,
    recommendedAction,
    isFullySecured,
    isLoading: userLoading || profileLoading,
  };
}
