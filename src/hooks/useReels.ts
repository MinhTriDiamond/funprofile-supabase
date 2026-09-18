import { useCallback } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
export interface Reel {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  slug: string | null;
  audio_name: string | null;
  audio_artist: string | null;
  duration_seconds: number | null;
  visibility: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profiles: {
    id: string;
    username: string;
    avatar_url: string | null;
    full_name: string | null;
    wallet_address: string | null;
    btc_address: string | null;
  };
  is_liked?: boolean;
  is_bookmarked?: boolean;
}

export interface ReelComment {
  id: string;
  reel_id: string;
  user_id: string;
  parent_comment_id: string | null;
  content: string;
  like_count: number;
  created_at: string;
  profiles?: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

interface ReelsPage {
  reels: Reel[];
  nextOffset: number | null;
}

export function useReels(limit = 10) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();

  const fetchReelsPage = useCallback(async (offset: number): Promise<ReelsPage> => {
    const { data, error } = await supabase.functions.invoke('get-reel-recommendations', {
      body: { limit, offset },
    });

    if (!error && Array.isArray(data)) {
      return {
        reels: data as Reel[],
        nextOffset: data.length === limit ? offset + data.length : null,
      };
    }

    const { data: directReels, error: directError } = await supabase
      .from('reels')
      .select('*, profiles:user_id (id, username, avatar_url, full_name, wallet_address, btc_address), slug')
      .eq('visibility', 'public')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (directError) throw directError;

    let enrichedReels = directReels || [];
    if (currentUser && enrichedReels.length > 0) {
      const reelIds = enrichedReels.map((r) => r.id);
      const [likesRes, bookmarksRes] = await Promise.all([
        supabase.from('reel_likes').select('reel_id').eq('user_id', currentUser.id).in('reel_id', reelIds),
        supabase.from('reel_bookmarks').select('reel_id').eq('user_id', currentUser.id).in('reel_id', reelIds),
      ]);
      const likedIds = new Set((likesRes.data || []).map((l) => l.reel_id));
      const bookmarkedIds = new Set((bookmarksRes.data || []).map((b) => b.reel_id));
      enrichedReels = enrichedReels.map((r) => ({
        ...r,
        is_liked: likedIds.has(r.id),
        is_bookmarked: bookmarkedIds.has(r.id),
      }));
    }

    return {
      reels: enrichedReels as Reel[],
      nextOffset: enrichedReels.length === limit ? offset + enrichedReels.length : null,
    };
  }, [currentUser, limit]);

  const {
    data,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<ReelsPage, Error>({
    queryKey: ['reels', limit, currentUser?.id],
    queryFn: ({ pageParam }) => fetchReelsPage(Number(pageParam || 0)),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    staleTime: 30 * 1000,
  });

  const reels = data?.pages.flatMap((page) => page.reels) || [];

  // Like/Unlike
  const toggleLike = useMutation({
    mutationFn: async ({ reelId, isLiked }: { reelId: string; isLiked: boolean }) => {
      if (!currentUser) throw new Error('Login required');
      if (isLiked) {
        await supabase.from('reel_likes').delete().eq('reel_id', reelId).eq('user_id', currentUser.id);
        await supabase.from('reels').update({ like_count: Math.max(0, (reels.find((r: any) => r.id === reelId)?.like_count || 1) - 1) }).eq('id', reelId);
      } else {
        await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: currentUser.id });
        await supabase.from('reels').update({ like_count: (reels.find((r: any) => r.id === reelId)?.like_count || 0) + 1 }).eq('id', reelId);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reels'] }),
  });

  // Add comment
  const addComment = useMutation({
    mutationFn: async ({ reelId, content, parentCommentId }: { reelId: string; content: string; parentCommentId?: string }) => {
      if (!currentUser) throw new Error('Login required');
      const { error } = await supabase.from('reel_comments').insert({
        reel_id: reelId,
        user_id: currentUser.id,
        content,
        parent_comment_id: parentCommentId || null,
      });
      if (error) throw error;
      // Update comment count
      await supabase.from('reels').update({
        comment_count: (reels.find((r: any) => r.id === reelId)?.comment_count || 0) + 1,
      }).eq('id', reelId);
    },
    onSuccess: (_, variables) => {
      // Sync real comment count from reel_comments table
      supabase
        .from('reel_comments')
        .select('id', { count: 'exact', head: true })
        .eq('reel_id', variables.reelId)
        .then(({ count }) => {
          if (count !== null) {
            supabase.from('reels').update({ comment_count: count }).eq('id', variables.reelId);
          }
        });
      queryClient.invalidateQueries({ queryKey: ['reels'] });
      queryClient.invalidateQueries({ queryKey: ['reel-comments'] });
    },
  });

  // Record view
  const recordView = useCallback(async (reelId: string, watchDuration?: number, completed?: boolean) => {
    if (!currentUser) return;
    try {
      await supabase.from('reel_views').insert({
        reel_id: reelId,
        user_id: currentUser.id,
        watch_duration_seconds: watchDuration || 0,
        completed: completed || false,
      });
    } catch {
      // View tracking must never interrupt reel playback.
    }
  }, [currentUser]);

  // Share reel
  const shareReel = useMutation({
    mutationFn: async ({ reelId, sharedTo }: { reelId: string; sharedTo?: string }) => {
      if (!currentUser) throw new Error('Login required');
      await supabase.from('reel_shares').insert({
        reel_id: reelId,
        user_id: currentUser.id,
        shared_to: sharedTo || 'feed',
      });
      await supabase.from('reels').update({
        share_count: (reels.find((r: any) => r.id === reelId)?.share_count || 0) + 1,
      }).eq('id', reelId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reels'] }),
  });

  // Upload reel
  const uploadReel = useMutation({
    mutationFn: async ({ videoUrl, caption, visibility }: { videoUrl: string; caption?: string; visibility?: string }) => {
      if (!currentUser) throw new Error('Login required');
      const { error } = await supabase.from('reels').insert({
        user_id: currentUser.id,
        video_url: videoUrl,
        caption: caption || null,
        visibility: visibility || 'public',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reels'] });
      toast.success('Reel uploaded!');
    },
  });

  return {
    reels: reels as Reel[],
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    toggleLike,
    addComment,
    recordView,
    shareReel,
    uploadReel,
    currentUser,
  };
}

export function useReelComments(reelId: string | null) {
  return useQuery({
    queryKey: ['reel-comments', reelId],
    queryFn: async () => {
      if (!reelId) return [];
      const { data, error } = await supabase
        .from('reel_comments')
        .select('*, profiles:user_id (id, username, avatar_url)')
        .eq('reel_id', reelId)
        .is('parent_comment_id', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ReelComment[];
    },
    enabled: !!reelId,
  });
}
