import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PostStats, ReactionCount } from '@/components/feed/types';

function computeReactionCounts(reactions: { id: string; user_id: string; type: string }[]): ReactionCount[] {
  const counts: Record<string, number> = {};
  reactions.forEach((r) => {
    counts[r.type] = (counts[r.type] || 0) + 1;
  });
  return Object.entries(counts).map(([type, count]) => ({ type, count }));
}

export function usePostStats(postId: string, currentUserId: string, initialStats?: PostStats, disableRealtime?: boolean) {
  const [likeCount, setLikeCount] = useState(initialStats?.reactions?.length || 0);
  const [commentCount, setCommentCount] = useState(initialStats?.commentCount || 0);
  const [shareCount, setShareCount] = useState(initialStats?.shareCount || 0);
  const [currentReaction, setCurrentReaction] = useState<string | null>(null);
  const [reactionCounts, setReactionCounts] = useState<ReactionCount[]>([]);
  const isStatsLoadedRef = useRef(!!initialStats);

  const processReactions = useCallback((reactions: { id: string; user_id: string; type: string }[]) => {
    setLikeCount(reactions.length);
    const userReaction = reactions.find((r) => r.user_id === currentUserId);
    setCurrentReaction(userReaction?.type || null);
    setReactionCounts(computeReactionCounts(reactions));
  }, [currentUserId]);

  // Initialize from pre-fetched stats or fetch individually
  useEffect(() => {
    if (initialStats) {
      processReactions(initialStats.reactions);
      setCommentCount(initialStats.commentCount);
      setShareCount(initialStats.shareCount);
      isStatsLoadedRef.current = true;
    } else if (!isStatsLoadedRef.current) {
      const fetchStats = async () => {
        try {
          const [reactionsRes, commentsRes, sharesRes] = await Promise.all([
            supabase.from('reactions').select('id, user_id, type').eq('post_id', postId).is('comment_id', null),
            supabase.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', postId),
            supabase.from('shared_posts').select('*', { count: 'exact', head: true }).eq('original_post_id', postId),
          ]);
          if (reactionsRes.data) processReactions(reactionsRes.data);
          setCommentCount(commentsRes.count || 0);
          setShareCount(sharesRes.count || 0);
          isStatsLoadedRef.current = true;
        } catch (error) {
          console.error('Error fetching post stats:', error);
        }
      };
      fetchStats();
    }
  }, [initialStats, postId, processReactions]);

  // Realtime subscription (skipped on profile page)
  useEffect(() => {
    if (disableRealtime) return;

    const handleRealtimeUpdate = async () => {
      const { data: reactions } = await supabase
        .from('reactions').select('id, user_id, type').eq('post_id', postId).is('comment_id', null);
      if (reactions) processReactions(reactions);

      const { count: commentsCount } = await supabase
        .from('comments').select('*', { count: 'exact', head: true }).eq('post_id', postId);
      setCommentCount(commentsCount || 0);

      const { count: sharesCount } = await supabase
        .from('shared_posts').select('*', { count: 'exact', head: true }).eq('original_post_id', postId);
      setShareCount(sharesCount || 0);
    };

    const channel = supabase
      .channel(`post-${postId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `post_id=eq.${postId}` }, handleRealtimeUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` }, handleRealtimeUpdate)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [postId, processReactions, disableRealtime]);

  const handleReactionChange = useCallback((newCount: number, newReaction: string | null) => {
    setLikeCount(newCount);
    setCurrentReaction(newReaction);
  }, []);

  const incrementCommentCount = useCallback(() => {
    setCommentCount((prev) => prev + 1);
  }, []);

  return {
    likeCount, commentCount, shareCount,
    currentReaction, reactionCounts,
    handleReactionChange, incrementCommentCount,
    setShareCount,
  };
}
