import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PolledPostStats {
  reactions: { id: string; user_id: string; type: string }[];
  commentCount: number;
  shareCount: number;
}

const POLL_INTERVAL = 30_000; // 30 seconds

/**
 * Batch-polls stats for visible posts on the Profile page.
 * Replaces per-post Realtime channels with 2 queries every 30s.
 */
export function useProfilePolling(postIds: string[]) {
  const [statsMap, setStatsMap] = useState<Record<string, PolledPostStats>>({});
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Stable stringified key to avoid re-running effect on every render
  const postIdsKey = useMemo(() => postIds.join(','), [postIds]);

  const fetchBatchStats = useCallback(async () => {
    const ids = Array.from(visibleIdsRef.current);
    if (ids.length === 0) return;

    try {
      const [reactionsRes, commentsRes, sharesRes] = await Promise.all([
        supabase
          .from('reactions')
          .select('post_id, id, user_id, type')
          .in('post_id', ids)
          .is('comment_id', null),
        supabase
          .from('comments')
          .select('post_id')
          .in('post_id', ids),
        supabase
          .from('shared_posts')
          .select('original_post_id')
          .in('original_post_id', ids),
      ]);

      const newMap: Record<string, PolledPostStats> = {};

      // Process reactions
      const reactionsByPost = new Map<string, { id: string; user_id: string; type: string }[]>();
      (reactionsRes.data || []).forEach((r) => {
        const list = reactionsByPost.get(r.post_id) || [];
        list.push(r);
        reactionsByPost.set(r.post_id, list);
      });

      // Process comment counts
      const commentCountByPost = new Map<string, number>();
      (commentsRes.data || []).forEach((c) => {
        commentCountByPost.set(c.post_id, (commentCountByPost.get(c.post_id) || 0) + 1);
      });

      const shareCountByPost = new Map<string, number>();
      (sharesRes.data || []).forEach((s) => {
        shareCountByPost.set(s.original_post_id, (shareCountByPost.get(s.original_post_id) || 0) + 1);
      });

      for (const id of ids) {
        newMap[id] = {
          reactions: reactionsByPost.get(id) || [],
          commentCount: commentCountByPost.get(id) || 0,
          shareCount: shareCountByPost.get(id) || 0,
        };
      }

      setStatsMap((prev) => ({ ...prev, ...newMap }));
    } catch (err) {
      console.error('useProfilePolling fetch error:', err);
    }
  }, []);

  // Track which post IDs exist
  useEffect(() => {
    visibleIdsRef.current = new Set(postIds);
  }, [postIdsKey]);

  // Set up polling interval
  useEffect(() => {
    if (postIds.length === 0) return;

    // Initial fetch shortly after first paint; cards receive zero stats first to
    // avoid per-post stats queries, then this batch updates them together.
    const initialTimer = setTimeout(fetchBatchStats, 250);

    timerRef.current = setInterval(fetchBatchStats, POLL_INTERVAL);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(timerRef.current);
    };
  }, [postIdsKey, fetchBatchStats]);

  return statsMap;
}
