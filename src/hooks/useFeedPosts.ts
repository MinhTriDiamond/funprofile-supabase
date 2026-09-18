import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface PostStats {
  reactions: { id: string; user_id: string; type: string }[];
  commentCount: number;
  shareCount: number;
}

export interface GiftProfile {
  username: string;
  display_name?: string | null;
  avatar_url: string | null;
}

export interface PostAttachmentData {
  id: string;
  file_url: string;
  storage_key: string | null;
  file_type: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  sort_order: number;
  alt_text: string | null;
}

export interface FeedPost {
  id: string;
  content: string;
  image_url: string | null;
  video_url: string | null;
  media_urls: Array<{ url: string; type: 'image' | 'video' }> | null;
  created_at: string;
  user_id: string;
  visibility: string;
  post_type?: string;
  tx_hash?: string | null;
  gift_sender_id?: string | null;
  gift_recipient_id?: string | null;
  gift_token?: string | null;
  gift_amount?: string | null;
  gift_message?: string | null;
  is_highlighted?: boolean;
  highlight_expires_at?: string | null;
  metadata?: Record<string, unknown>;
  profiles: {
    username: string;
    display_name?: string | null;
    avatar_url: string | null;
    public_wallet_address?: string | null;
    is_banned?: boolean;
    is_live?: boolean | null;
    current_live_session_id?: string | null;
    live_started_at?: string | null;
  };
  recipientProfile?: GiftProfile | null;
  senderProfile?: GiftProfile | null;
  attachments?: PostAttachmentData[];
}

export interface SharedFeedPost {
  _type: 'shared';
  id: string;
  user_id: string;
  original_post_id: string;
  caption: string | null;
  visibility: string;
  created_at: string;
  profiles: FeedPost['profiles'];
  posts: FeedPost | null;
}

export type FeedItem = FeedPost | SharedFeedPost;

interface FeedPage {
  posts: FeedItem[];
  postStats: Record<string, PostStats>;
  nextCursor: string | null;
}

const POSTS_PER_PAGE = 20;

const isLiveLikePostPayload = (row: any): boolean => {
  const metadata = row?.metadata || {};
  return (
    row?.post_type === 'live' ||
    row?.post_type === 'live_replay' ||
    Boolean(metadata?.live_session_id || metadata?.live_status)
  );
};

// Batch fetch all post stats via server-side aggregation
const fetchPostStats = async (postIds: string[]): Promise<Record<string, PostStats>> => {
  if (postIds.length === 0) return {};

  try {
    const { data, error } = await supabase.rpc('get_post_stats', { p_post_ids: postIds });

    if (error) {
      console.error('Post stats RPC error:', error);
      throw error;
    }

    const stats: Record<string, PostStats> = {};
    (data || []).forEach((row: any) => {
      const reactions = Array.isArray(row.reactions) ? row.reactions : [];
      stats[row.post_id] = {
        reactions: reactions.map((r: any) => ({ id: r.id, user_id: r.user_id, type: r.type })),
        commentCount: Number(row.comment_count) || 0,
        shareCount: Number(row.share_count) || 0,
      };
    });

    postIds.forEach(id => {
      if (!stats[id]) {
        stats[id] = { reactions: [], commentCount: 0, shareCount: 0 };
      }
    });

    return stats;
  } catch (error) {
    console.error('Error fetching post stats:', error);
    return postIds.reduce((acc, id) => {
      acc[id] = { reactions: [], commentCount: 0, shareCount: 0 };
      return acc;
    }, {} as Record<string, PostStats>);
  }
};

// Batch fetch attachments for posts
const fetchPostAttachments = async (postIds: string[]): Promise<Record<string, PostAttachmentData[]>> => {
  if (postIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('post_attachments')
      .select('id, post_id, file_url, storage_key, file_type, mime_type, width, height, size_bytes, sort_order, alt_text')
      .in('post_id', postIds)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Post attachments fetch error:', error);
      return {};
    }

    const map: Record<string, PostAttachmentData[]> = {};
    (data || []).forEach((row: any) => {
      if (!map[row.post_id]) map[row.post_id] = [];
      map[row.post_id].push(row);
    });
    return map;
  } catch (error) {
    console.error('Error fetching post attachments:', error);
    return {};
  }
};

// Batch-fetch profiles for gift_celebration posts
const fetchGiftProfiles = async (posts: FeedPost[]): Promise<FeedPost[]> => {
  const giftPosts = posts.filter(p => p.post_type === 'gift_celebration');
  if (giftPosts.length === 0) return posts;

  const profileIds = new Set<string>();
  giftPosts.forEach(p => {
    if (p.gift_recipient_id) profileIds.add(p.gift_recipient_id);
    if (p.gift_sender_id && p.gift_sender_id !== p.user_id) profileIds.add(p.gift_sender_id);
  });

  if (profileIds.size === 0) return posts;

  const { data: profiles } = await supabase
    .from('public_profiles')
    .select('id, username, display_name, avatar_url, is_live, current_live_session_id, live_started_at')
    .in('id', Array.from(profileIds));

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  return posts.map(post => {
    if (post.post_type !== 'gift_celebration') return post;
    return {
      ...post,
      recipientProfile: post.gift_recipient_id ? (profileMap.get(post.gift_recipient_id) || null) : null,
      senderProfile: (post.gift_sender_id && post.gift_sender_id !== post.user_id)
        ? (profileMap.get(post.gift_sender_id) || null)
        : null,
    };
  });
};

const fetchProfilesById = async (profileIds: string[]): Promise<Map<string, FeedPost['profiles']>> => {
  if (profileIds.length === 0) return new Map();

  const { data } = await supabase
    .from('public_profiles')
    .select('id, username, display_name, avatar_url, public_wallet_address, is_banned, is_live, current_live_session_id, live_started_at')
    .in('id', profileIds);

  return new Map((data || []).map((profile: any) => [profile.id, profile]));
};

// Fetch friend IDs for a user
const fetchFriendIds = async (userId: string | null): Promise<Set<string>> => {
  if (!userId) return new Set();
  const { data } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .eq('status', 'accepted')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  const ids = new Set<string>();
  (data || []).forEach((f: any) => {
    ids.add(f.user_id === userId ? f.friend_id : f.user_id);
  });
  return ids;
};

// Fetch highlighted (pinned) gift celebration posts (today VN time)
const fetchHighlightedPosts = async (): Promise<FeedPost[]> => {
  // Calculate start of today in VN timezone (UTC+7)
  const now = new Date();
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const vnMidnight = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate(), 0, 0, 0));
  const utcStart = new Date(vnMidnight.getTime() - 7 * 60 * 60 * 1000);
  
  const { data, error } = await supabase
    .from('posts')
    .select(`*, public_profiles!posts_user_id_fkey (username, display_name, avatar_url, public_wallet_address, is_banned, is_live, current_live_session_id, live_started_at)`)
    .eq('post_type', 'gift_celebration')
    .is('deleted_at', null)
    .eq('visibility', 'public')
    .gte('created_at', utcStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('Error fetching highlighted posts:', error);
    return [];
  }

  const posts: FeedPost[] = (data || []).map((post: any) => ({
    ...post,
    profiles: post.public_profiles,
    media_urls: (post.media_urls as Array<{ url: string; type: 'image' | 'video' }>) || null,
    visibility: post.visibility || 'public',
  })).filter((post: FeedPost) => !post.profiles?.is_banned);

  return fetchGiftProfiles(posts);
};

const fetchFeedPage = async (cursor: string | null, friendIds: Set<string>, currentUserId: string | null): Promise<FeedPage> => {
  let query = supabase
    .from('posts')
    .select(`*, public_profiles!posts_user_id_fkey (username, display_name, avatar_url, public_wallet_address, is_banned, is_live, current_live_session_id, live_started_at)`)
    .neq('post_type', 'gift_celebration')
    .is('deleted_at', null)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(POSTS_PER_PAGE + 1);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  // Tách shared_posts thành 2 query không nested để tránh PostgREST timeout 8s.
  let sharedQuery = supabase
    .from('shared_posts')
    .select('id, user_id, original_post_id, caption, visibility, created_at')
    .order('created_at', { ascending: false })
    .limit(POSTS_PER_PAGE + 1);

  if (cursor) {
    sharedQuery = sharedQuery.lt('created_at', cursor);
  }

  const [{ data: posts, error }, sharedResult] = await Promise.all([
    query,
    sharedQuery.then(
      (r) => r as { data: any[] | null; error: unknown },
      (e) => ({ data: [] as any[], error: e })
    ),
  ]);

  const sharedRows = sharedResult.data || [];
  const sharedError = sharedResult.error;

  if (error) throw error;
  if (sharedError) console.error('Error fetching shared posts:', sharedError);

  let postsData: FeedPost[] = (posts || []).map((post: any) => ({
    ...post,
    profiles: post.public_profiles,
    media_urls: (post.media_urls as Array<{ url: string; type: 'image' | 'video' }>) || null,
    visibility: post.visibility || 'public',
  })).filter((post: FeedPost) => !post.profiles?.is_banned);

  postsData = await fetchGiftProfiles(postsData);

  const originalIds = Array.from(
    new Set(sharedRows.map((r: any) => r.original_post_id).filter(Boolean))
  );
  const sharerIds = Array.from(
    new Set(sharedRows.map((row: any) => row.user_id).filter(Boolean))
  );

  const [originalsRes, sharerProfiles] = await Promise.all([
    originalIds.length === 0
      ? Promise.resolve({ data: [] as any[] })
      : supabase
          .from('posts')
          .select(`*, public_profiles!posts_user_id_fkey (username, display_name, avatar_url, public_wallet_address, is_banned, is_live, current_live_session_id, live_started_at)`)
          .in('id', originalIds),
    fetchProfilesById(sharerIds),
  ]);

  const originalsMap = new Map<string, any>(
    ((originalsRes as { data: any[] | null }).data || []).map((p: any) => [p.id, p])
  );

  let sharedPostsData: SharedFeedPost[] = sharedRows
    .map((row: any) => {
      const visibility = row.visibility || 'public';
      const canView =
        visibility === 'public' ||
        row.user_id === currentUserId ||
        (visibility === 'friends' && friendIds.has(row.user_id));
      if (!canView) return null;

      const sharerProfile = sharerProfiles.get(row.user_id);
      if (!sharerProfile || sharerProfile.is_banned) return null;

      const originalRaw = originalsMap.get(row.original_post_id);
      const originalVisibility = originalRaw?.visibility || 'public';
      const canViewOriginal = originalRaw && (
        originalVisibility === 'public' ||
        originalRaw.user_id === currentUserId ||
        (originalVisibility === 'friends' && friendIds.has(originalRaw.user_id))
      );
      const original = originalRaw && !originalRaw.deleted_at && canViewOriginal
        ? ({
            ...originalRaw,
            profiles: originalRaw.public_profiles,
            media_urls: (originalRaw.media_urls as Array<{ url: string; type: 'image' | 'video' }>) || null,
            visibility: originalRaw.visibility || 'public',
          } as FeedPost)
        : null;

      if (original?.profiles?.is_banned) return null;

      return {
        _type: 'shared' as const,
        id: row.id,
        user_id: row.user_id,
        original_post_id: row.original_post_id,
        caption: row.caption || null,
        visibility,
        created_at: row.created_at,
        profiles: sharerProfile,
        posts: original,
      };
    })
    .filter(Boolean) as SharedFeedPost[];

  const combined = [...postsData, ...sharedPostsData]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const hasMore = combined.length > POSTS_PER_PAGE;
  const itemsToReturn = hasMore ? combined.slice(0, POSTS_PER_PAGE) : combined;
  const nextCursor = hasMore && itemsToReturn.length > 0
    ? itemsToReturn[itemsToReturn.length - 1].created_at
    : null;

  const postIds = itemsToReturn
    .map((item) => ('_type' in item && item._type === 'shared' ? item.posts?.id : item.id))
    .filter(Boolean) as string[];
  const [postStats, attachmentsMap] = await Promise.all([
    fetchPostStats(postIds),
    fetchPostAttachments(postIds),
  ]);

  const itemsWithAttachments = itemsToReturn.map((item) => {
    if ('_type' in item && item._type === 'shared') {
      return item.posts
        ? { ...item, posts: { ...item.posts, attachments: attachmentsMap[item.posts.id] || [] } }
        : item;
    }
    return { ...item, attachments: attachmentsMap[item.id] || [] };
  });

  return { posts: itemsWithAttachments, postStats, nextCursor };
};

export const useFeedPosts = () => {
  const queryClient = useQueryClient();
  const { userId: currentUserId } = useCurrentUser();

  // Cache friend IDs
  const { data: friendIdsData } = useQuery({
    queryKey: ['friend-ids', currentUserId],
    queryFn: () => fetchFriendIds(currentUserId),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: !!currentUserId,
  });
  const friendIds = useMemo(() => friendIdsData ?? new Set<string>(), [friendIdsData]);

  const query = useInfiniteQuery<FeedPage, Error>({
    queryKey: ['feed-posts', currentUserId],
    queryFn: ({ pageParam }) => fetchFeedPage(pageParam as string | null, friendIds, currentUserId),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: FeedPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2,
    placeholderData: (prev: any) => prev,
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['feed-posts'] });
  }, [queryClient]);

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['feed-posts'] });
      queryClient.invalidateQueries({ queryKey: ['highlighted-posts'] });
    };
    window.addEventListener('invalidate-feed', handler);
    return () => window.removeEventListener('invalidate-feed', handler);
  }, [queryClient]);

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      queryClient.invalidateQueries({ queryKey: ['feed-posts'] });
      queryClient.invalidateQueries({ queryKey: ['highlighted-posts'] });
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [queryClient]);

  // Realtime: instantly refresh gift celebrations on any change
  useEffect(() => {
    const invalidateGifts = () => {
      queryClient.invalidateQueries({ queryKey: ['highlighted-posts'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['gift-day-counts'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['gift-day-token-totals'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['donation-count-by-date'], refetchType: 'active' });
    };

    // Debounce burst events (father chuyển liên tục) — gom 400ms để tránh refetch dồn dập
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleInvalidate = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        invalidateGifts();
      }, 400);
    };

    const channel = supabase
      .channel('gift-celebration-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: 'post_type=eq.gift_celebration',
        },
        () => scheduleInvalidate()
      )
      // Lắng nghe cả donations để bắt sớm hơn (gift post tạo cùng lúc nhưng đôi khi
      // realtime posts bị miss; donations là source of truth)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'donations',
        },
        () => scheduleInvalidate()
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'donations',
        },
        () => scheduleInvalidate()
      )
      .subscribe((status) => {
        // If channel disconnects then reconnects, refetch to catch missed events
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setTimeout(() => invalidateGifts(), 1500);
        }
      });

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Realtime: live/live_replay posts không nằm trong filter gift_celebration ở trên,
  // nhưng feed cũng cần thấy ngay khi user bắt đầu/kết thúc live (đặc biệt trên mobile cùng tab).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        queryClient.invalidateQueries({ queryKey: ['feed-posts'] });
        queryClient.invalidateQueries({ queryKey: ['highlighted-posts'] });
      }, 800);
    };

    const channel = supabase
      .channel('live-posts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        (payload: any) => {
          if (isLiveLikePostPayload(payload?.new) || isLiveLikePostPayload(payload?.old)) schedule();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_sessions' },
        (payload: any) => {
          const row = payload?.new || payload?.old || {};
          if (
            row?.post_id
            || row?.live_post_id
            || row?.replay_post_id
            || row?.archive_url
            || row?.status
            || row?.recording_status
          ) {
            schedule();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_replays' },
        (payload: any) => {
          const row = payload?.new || payload?.old || {};
          if (
            row?.post_id
            || row?.live_post_id
            || row?.replay_post_id
            || row?.chunked_recording_id
            || row?.playback_url
            || row?.r2_video_url
            || row?.archive_mp4_url
            || row?.replay_status
          ) {
            schedule();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: any) => {
          const oldRow = payload?.old || {};
          const newRow = payload?.new || {};
          if (
            oldRow?.is_live !== newRow?.is_live
            || oldRow?.current_live_session_id !== newRow?.current_live_session_id
            || oldRow?.live_started_at !== newRow?.live_started_at
          ) {
            schedule();
            queryClient.invalidateQueries({ queryKey: ['live-active-sessions'] });
          }
        }
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const highlightedQuery = useQuery<{ posts: FeedPost[]; postStats: Record<string, PostStats> }>({
    queryKey: ['highlighted-posts'],
    queryFn: async () => {
      const posts = await fetchHighlightedPosts();
      const postIds = posts.map(p => p.id);
      const postStats = await fetchPostStats(postIds);
      return { posts, postStats };
    },
    staleTime: 10 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 20 * 1000, // Polling fallback khi realtime miss event
    refetchIntervalInBackground: false,
    retry: 3,
    placeholderData: (prev) => prev,
  });

  const highlightedPosts = highlightedQuery.data?.posts || [];
  const highlightedStats = highlightedQuery.data?.postStats || {};
  const highlightedIds = new Set(highlightedPosts.map(p => p.id));

  const regularPosts = (query.data?.pages?.flatMap(page => page.posts) || [])
    .filter(p => !highlightedIds.has(p.id));

  const allPosts = [...highlightedPosts, ...regularPosts];
  const allPostStats = {
    ...highlightedStats,
    ...(query.data?.pages?.reduce((acc, page) => {
      return { ...acc, ...page.postStats };
    }, {} as Record<string, PostStats>) || {}),
  };

  return {
    posts: allPosts,
    postStats: allPostStats,
    isLoading: query.isLoading && !query.data,
    isGiftLoading: highlightedQuery.isLoading && !highlightedQuery.data,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    refetch,
  };
};
