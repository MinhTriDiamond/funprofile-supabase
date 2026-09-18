/**
 * SR-1: useCurrentUser — Singleton hook for current authenticated user
 *
 * Problem solved: 67+ files each calling supabase.auth.getSession()/getUser()
 * independently → redundant network calls, no caching, no deduplication.
 *
 * Solution: Single React Query entry with `staleTime: Infinity`.
 * All components share the same cache. Auth state changes invalidate automatically.
 *
 * Usage:
 *   const { user, userId, isLoading } = useCurrentUser();
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

export const CURRENT_USER_QUERY_KEY = ['current-user'] as const;

async function fetchCurrentUser(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

/**
 * Primary hook — use this everywhere instead of supabase.auth.getUser/getSession
 */
export function useCurrentUser() {
  const queryClient = useQueryClient();

  // Keep auth state in sync with Supabase SDK events
  useEffect(() => {
    let signOutTimer: ReturnType<typeof setTimeout> | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // On sign in / token refresh → update cache immediately (no network call)
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        // Cancel any pending sign-out verification
        if (signOutTimer) {
          clearTimeout(signOutTimer);
          signOutTimer = null;
        }
        queryClient.setQueryData(CURRENT_USER_QUERY_KEY, session?.user ?? null);
      }
      // On sign out → delayed verification to avoid false sign-outs from tab switching
      if (event === 'SIGNED_OUT') {
        if (signOutTimer) clearTimeout(signOutTimer);
        signOutTimer = setTimeout(async () => {
          signOutTimer = null;
          // Double-check: is the session truly gone?
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (!currentSession) {
            queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
          }
          // If session recovered, do nothing — a SIGNED_IN/TOKEN_REFRESHED event will update cache
        }, 1000);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (signOutTimer) clearTimeout(signOutTimer);
    };
  }, [queryClient]);

  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: fetchCurrentUser,
    staleTime: Infinity,   // auth SDK manages freshness via onAuthStateChange
    gcTime: Infinity,      // never garbage collect — session is always needed
    retry: false,          // don't retry auth failures
  });

  return {
    user: user ?? null,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    isLoading,
    isAuthenticated: !!user,
    error: error ? (error as Error).message : null,
  };
}

/**
 * Utility: invalidate current user cache from anywhere (e.g. after profile update)
 */
export { fetchCurrentUser };
