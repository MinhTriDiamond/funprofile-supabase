/**
 * useCapabilities — Unified capability/policy layer
 *
 * Single source of truth for ALL permission checks across the app.
 * Combines:
 *   - useAccountCapabilities (account status, reward gating)
 *   - useAdminRole (admin check via has_role RPC)
 *
 * Usage:
 *   const { canCreatePost, canChat, isAdmin, isLimited } = useCapabilities();
 */

import { useAccountCapabilities } from '@/hooks/useAccountCapabilities';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface Capabilities {
  // ── Auth state ──
  isAuthenticated: boolean;
  isLoading: boolean;

  // ── Content permissions ──
  canViewContent: boolean;
  canCreatePost: boolean;
  canComment: boolean;
  canReact: boolean;
  canChat: boolean;

  // ── Reward permissions ──
  canAccrueRewards: boolean;
  canExtractRewards: boolean;

  // ── Account state ──
  isAdmin: boolean;
  isWalletFirstAccount: boolean;
  isLimitedAccount: boolean;
  limitedReason: 'email_not_verified' | 'banned' | null;

  // ── Derived security level ──
  securityLevel: 'full' | 'limited' | 'guest';
}

export function useCapabilities(): Capabilities {
  const { isAuthenticated, isLoading: userLoading } = useCurrentUser();
  const caps = useAccountCapabilities();
  const { isAdmin, isLoading: adminLoading } = useAdminRole();

  const securityLevel: Capabilities['securityLevel'] = !isAuthenticated
    ? 'guest'
    : caps.isLimitedAccount
      ? 'limited'
      : 'full';

  return {
    isAuthenticated,
    isLoading: userLoading || caps.isLoading || adminLoading,

    canViewContent: caps.canViewContent,
    canCreatePost: caps.canCreatePost,
    canComment: caps.canComment,
    canReact: caps.canReact,
    canChat: caps.canChat,

    canAccrueRewards: caps.canAccrueRewards,
    canExtractRewards: caps.canExtractRewards,

    isAdmin,
    isWalletFirstAccount: caps.isWalletFirstAccount,
    isLimitedAccount: caps.isLimitedAccount,
    limitedReason: caps.limitedReason,

    securityLevel,
  };
}
