import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { LiveCommentRow } from '@/types/realtimeRows';

export interface LiveComment {
  id: string;
  live_session_id: string;
  user_id: string;
  message: string;
  created_at: string;
  profile?: {
    username: string;
    avatar_url: string | null;
  };
}

export function useLiveComments(liveSessionId?: string) {
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { userId } = useCurrentUser();
  useEffect(() => {
    if (!liveSessionId) return;

    const fetchComments = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('live_comments')
        .select('*')
        .eq('live_session_id', liveSessionId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (!error && data) {
        const userIds = [...new Set(data.map((d) => d.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(
          (profiles || []).map((p) => [p.id, { username: p.username, avatar_url: p.avatar_url }])
        );
        setComments(
          data.map((d) => ({
            id: d.id,
            live_session_id: d.live_session_id,
            user_id: d.user_id,
            message: d.message,
            created_at: d.created_at,
            profile: profileMap.get(d.user_id),
          }))
        );
      }
      setIsLoading(false);
    };

    fetchComments();
  }, [liveSessionId]);

  useEffect(() => {
    if (!liveSessionId) return;

    const channel = supabase
      .channel(`live-comments-${liveSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_comments',
          filter: `live_session_id=eq.${liveSessionId}`,
        },
        async (payload) => {
          const newRow = payload.new as LiveCommentRow;
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', newRow.user_id)
            .single();

          const comment: LiveComment = {
            id: newRow.id,
            live_session_id: newRow.live_session_id,
            user_id: newRow.user_id,
            message: newRow.message,
            created_at: newRow.created_at,
            profile: profile ?? undefined,
          };

          setComments((prev) => [...prev, comment]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveSessionId]);

  const sendComment = useCallback(
    async (message: string) => {
      if (!liveSessionId || !message.trim() || !userId) return;

      await supabase.from('live_comments').insert({
        live_session_id: liveSessionId,
        user_id: userId,
        message: message.trim(),
      });
    },
    [liveSessionId, userId]
  );

  return { comments, isLoading, sendComment };
}
