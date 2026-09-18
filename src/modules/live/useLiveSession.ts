import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLiveSession, listActiveLiveSessions } from './liveService';

export function useLiveSession(sessionId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['live-session', sessionId],
    queryFn: async () => {
      // Handle replication race: if maybeSingle returns null right after edge inserted
      // the row, retry a few times before concluding the session doesn't exist.
      const first = await getLiveSession(sessionId as string);
      if (first) return first;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        const retry = await getLiveSession(sessionId as string);
        if (retry) return retry;
      }
      return null;
    },
    enabled: !!sessionId,
    staleTime: 10_000,
    retry: 2,
    retryDelay: (attempt) => 500 * (attempt + 1),
  });

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`live-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_sessions', filter: `id=eq.${sessionId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['live-session', sessionId] });
          queryClient.invalidateQueries({ queryKey: ['live-active-sessions'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient]);

  return query;
}

export function useActiveLiveSessions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['live-active-sessions'],
    queryFn: listActiveLiveSessions,
    staleTime: 10_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('live-active-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['live-active-sessions'] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload: any) => {
        if (
          payload?.old?.is_live !== payload?.new?.is_live
          || payload?.old?.current_live_session_id !== payload?.new?.current_live_session_id
        ) {
          queryClient.invalidateQueries({ queryKey: ['live-active-sessions'] });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}
