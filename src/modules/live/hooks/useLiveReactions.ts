import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { LiveReactionRow } from '@/types/realtimeRows';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface LiveReaction {
  id: number;
  session_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

const THROTTLE_MS = 300;

export function useLiveReactions(sessionId?: string) {
  const [reactions, setReactions] = useState<LiveReaction[]>([]);
  const [reactionCount, setReactionCount] = useState(0);
  const lastSendAtRef = useRef(0);
  const channelSuffix = useRef(Math.random().toString(36).slice(2));
  const { userId } = useCurrentUser();

  useEffect(() => {
    if (!sessionId) {
      setReactionCount(0);
      setReactions([]);
      return;
    }

    let active = true;

    supabase
      .from('live_reactions')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .then(({ count }) => {
        if (active) setReactionCount(count || 0);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`live-reactions:${sessionId}:${channelSuffix.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_reactions',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as LiveReactionRow;
          setReactionCount((value) => value + 1);
          setReactions((prev) => [
            ...prev.slice(-120),
            {
              id: row.id,
              session_id: row.session_id,
              user_id: row.user_id,
              emoji: row.emoji,
              created_at: row.created_at,
            },
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const sendReaction = useCallback(
    async (emoji: string) => {
      if (!sessionId || !userId) return false;
      const now = Date.now();
      if (now - lastSendAtRef.current < THROTTLE_MS) return false;
      lastSendAtRef.current = now;

      const { error } = await supabase.from('live_reactions').insert({
        session_id: sessionId,
        user_id: userId,
        emoji,
      });
      if (error) throw error;
      return true;
    },
    [sessionId, userId]
  );

  return { reactions, reactionCount, sendReaction };
}
