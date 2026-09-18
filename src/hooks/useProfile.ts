import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminRole } from '@/hooks/useAdminRole';
import type { PostStats } from '@/hooks/useFeedPosts';
import type { ProfilePostItem, OriginalProfilePost, SharedProfilePost, BasePostFields, ProfilePostProfile, ProfilePostReaction, ProfilePostComment } from '@/types/profilePosts';
import { isLiveLikePost } from '@/components/feed/livePostDetection';
import { OWN_PROFILE_COLUMNS } from '@/lib/profileColumns';

export interface FriendPreview {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_live?: boolean | null;
  current_live_session_id?: string | null;
  live_started_at?: string | null;
}

export interface ProfileData {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  full_name?: string | null;
  bio?: string | null;
  cover_url?: string | null;
  created_at: string;
  public_wallet_address?: string | null;
  external_wallet_address?: string | null;
  btc_address?: string | null;
  
  wallet_address?: string | null;
  social_links?: Array<{ platform: string; label: string; url: string; color: string; favicon: string; avatarUrl?: string }>;
  is_banned?: boolean;
  location?: string | null;
  workplace?: string | null;
  education?: string | null;
  relationship_status?: string | null;
  pinned_post_id?: string | null;
  fun_id?: string | null;
  admin_notes?: string | null;
  reward_status?: string | null;
  pending_reward?: number;
  approved_reward?: number;
  grand_total_deposit?: number;
  grand_total_withdraw?: number;
  grand_total_bet?: number;
  grand_total_win?: number;
  grand_total_loss?: number;
  grand_total_profit?: number;
  financial_updated_at?: string | null;
  is_live?: boolean | null;
  current_live_session_id?: string | null;
  live_started_at?: string | null;
}

const POSTS_PER_PAGE = 10;
const TIMELINE_QUERY_LIMIT = POSTS_PER_PAGE + 1;

const PROFILE_POST_COLUMNS = `
  id,
  slug,
  public_id,
  share_code,
  user_id,
  content,
  image_url,
  video_url,
  media_urls,
  created_at,
  visibility,
  post_type,
  metadata,
  replay_status,
  replay_ready,
  playback_provider,
  processing_message,
  gift_sender_id,
  gift_recipient_id,
  gift_token,
  gift_amount,
  gift_message,
  tx_hash,
  is_highlighted,
  highlight_expires_at,
  deleted_at,
  public_profiles!posts_user_id_fkey (
    username,
    display_name,
    avatar_url,
    full_name,
    public_wallet_address,
    btc_address,
    is_live,
    current_live_session_id,
    live_started_at
  )
`;
const PROFILE_POST_SELECT = PROFILE_POST_COLUMNS;
// Bài chia sẻ nay đọc qua RPC `get_profile_shared_posts` (xem fetchTimelinePage).



const reservedPaths = ['auth', 'feed', 'friends', 'wallet', 'about', 'leaderboard', 'admin', 'notifications', 'docs', 'post', 'law-of-light', 'profile'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE_REALTIME_REFRESH_DEBOUNCE_MS = 1200;
const PROFILE_REALTIME_REFRESH_MIN_INTERVAL_MS = 7000;
const PROFILE_VISIBILITY_REFRESH_STALE_MS = 30000;

type ProfileFetchMode = 'initial' | 'background' | 'timelineOnly';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isHlsUrl = (url?: string | null): boolean => !!url && /\.m3u8(?:\?|$)/i.test(url);

const firstNonHlsString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() && !isHlsUrl(value)) return value;
  }
  return null;
};

const liveStatusForSession = (status?: string | null): string =>
  status === 'live' || status === 'reconnecting' || status === 'disconnect_grace' ? 'live' : 'ended';

const isLiveProfilePost = (post: BasePostFields): boolean => {
  const metadata = isRecord(post.metadata) ? post.metadata : {};
  return isLiveLikePost(post as unknown as Record<string, unknown>, metadata);
};

async function hydrateProfileLivePosts<T extends BasePostFields>(posts: T[]): Promise<T[]> {
  const livePosts = posts.filter(isLiveProfilePost);
  if (livePosts.length === 0) return posts;

  const postIds = Array.from(new Set(livePosts.map((post) => post.id).filter((id): id is string => UUID_RE.test(String(id)))));
  const metadataSessionIds = Array.from(new Set(livePosts
    .map((post) => {
      const metadata = isRecord(post.metadata) ? post.metadata : {};
      return typeof metadata.live_session_id === 'string' && UUID_RE.test(metadata.live_session_id)
        ? metadata.live_session_id
        : null;
    })
    .filter((id): id is string => !!id)));

  const sessionRows: any[] = [];
  if (postIds.length > 0) {
    const inList = postIds.join(',');
    const { data, error } = await supabase
      .from('live_sessions')
      .select('id, mode, status, post_id, live_post_id, replay_post_id, archive_url, r2_video_url, replay_url, playback_url, recording_status, archive_status, host_connection_status, last_seen_at, last_host_heartbeat_at, ended_at, end_reason')
      .or(`post_id.in.(${inList}),live_post_id.in.(${inList}),replay_post_id.in.(${inList})`);
    if (!error && data) sessionRows.push(...data);
  }
  if (metadataSessionIds.length > 0) {
    const { data, error } = await supabase
      .from('live_sessions')
      .select('id, mode, status, post_id, live_post_id, replay_post_id, archive_url, r2_video_url, replay_url, playback_url, recording_status, archive_status, host_connection_status, last_seen_at, last_host_heartbeat_at, ended_at, end_reason')
      .in('id', metadataSessionIds);
    if (!error && data) sessionRows.push(...data);
  }

  const uniqueSessions = Array.from(new Map(sessionRows.map((row) => [row.id, row])).values());
  const sessionIds = Array.from(new Set([
    ...metadataSessionIds,
    ...uniqueSessions.map((session) => session.id).filter(Boolean),
  ]));

  const replayRows: any[] = [];
  if (sessionIds.length > 0) {
    const { data, error } = await (supabase.from('live_replays' as any) as any)
      .select('id, live_session_id, replay_post_id, status, replay_status, playback_mp4, r2_video_url, archive_mp4_url, playback_hls, temp_hls_url, archive_status, thumbnail_url, error_message')
      .in('live_session_id', sessionIds);
    if (!error && data) replayRows.push(...data);
  }
  if (postIds.length > 0) {
    const { data, error } = await (supabase.from('live_replays' as any) as any)
      .select('id, live_session_id, replay_post_id, status, replay_status, playback_mp4, r2_video_url, archive_mp4_url, playback_hls, temp_hls_url, archive_status, thumbnail_url, error_message')
      .in('replay_post_id', postIds);
    if (!error && data) replayRows.push(...data);
  }

  const sessionsById = new Map(uniqueSessions.map((session) => [session.id, session]));
  const sessionsByPostId = new Map<string, any>();
  uniqueSessions.forEach((session) => {
    [session.post_id, session.live_post_id, session.replay_post_id].forEach((id) => {
      if (id && !sessionsByPostId.has(id)) sessionsByPostId.set(id, session);
    });
  });

  const uniqueReplays = Array.from(new Map(replayRows.map((row) => [row.id, row])).values());
  const replaysBySessionId = new Map<string, any>();
  const replaysByPostId = new Map<string, any>();
  uniqueReplays.forEach((replay) => {
    if (replay.live_session_id && !replaysBySessionId.has(replay.live_session_id)) replaysBySessionId.set(replay.live_session_id, replay);
    if (replay.replay_post_id && !replaysByPostId.has(replay.replay_post_id)) replaysByPostId.set(replay.replay_post_id, replay);
  });

  return posts.map((post) => {
    if (!isLiveProfilePost(post)) return post;

    const metadata = isRecord(post.metadata) ? post.metadata : {};
    const sessionIdFromMetadata = typeof metadata.live_session_id === 'string' ? metadata.live_session_id : null;
    const session = (sessionIdFromMetadata && sessionsById.get(sessionIdFromMetadata)) || sessionsByPostId.get(post.id) || null;
    const replay = (session?.id && replaysBySessionId.get(session.id)) || replaysByPostId.get(post.id) || null;
    const finalUrl = firstNonHlsString(
      post.video_url,
      metadata.archive_url,
      metadata.archive_mp4_url,
      metadata.r2_video_url,
      metadata.playback_mp4,
      replay?.playback_mp4,
      replay?.r2_video_url,
      replay?.archive_mp4_url,
      session?.archive_url,
      session?.r2_video_url,
      session?.replay_url,
      session?.playback_url,
    );
    const failed = post.replay_status === 'failed'
      || replay?.replay_status === 'failed'
      || replay?.replay_status === 'failed_no_recording'
      || session?.recording_status === 'failed'
      || session?.status === 'recording_failed';
    const nextReplayStatus = finalUrl ? 'ready_mp4' : failed ? 'failed' : 'processing';
    const nextProcessingMessage = finalUrl
      ? null
      : failed
        ? 'Video đang xử lý lỗi, vui lòng thử lại sau'
        : 'Video đang được xử lý';

    const nextLiveStatus = session
      ? liveStatusForSession(session.status)
      : (typeof metadata.live_status === 'string'
        ? metadata.live_status
        : (finalUrl || post.post_type === 'live_replay' ? 'ended' : 'live'));

    return {
      ...post,
      video_url: finalUrl || null,
      post_type: finalUrl ? 'live_replay' : post.post_type,
      replay_status: nextReplayStatus,
      replay_ready: Boolean(finalUrl),
      playback_provider: finalUrl ? 'r2' : post.playback_provider,
      processing_message: nextProcessingMessage,
      metadata: {
        ...metadata,
        live_session_id: session?.id || sessionIdFromMetadata || replay?.live_session_id || null,
        live_status: nextLiveStatus,
        live_mode: session?.mode || metadata.live_mode || 'agora_webcam',
        status: session?.status || metadata.status || null,
        host_connection_status: session?.host_connection_status || metadata.host_connection_status || null,
        last_seen_at: session?.last_seen_at || metadata.last_seen_at || null,
        last_host_heartbeat_at: session?.last_host_heartbeat_at || metadata.last_host_heartbeat_at || null,
        ended_at: session?.ended_at || metadata.ended_at || null,
        end_reason: session?.end_reason || metadata.end_reason || null,
        replay_id: replay?.id || metadata.replay_id || null,
        replay_status: nextReplayStatus,
        replay_ready: Boolean(finalUrl),
        archive_status: replay?.archive_status || session?.archive_status || metadata.archive_status || null,
        archive_url: finalUrl || metadata.archive_url || null,
        r2_video_url: finalUrl || metadata.r2_video_url || null,
        playback_mp4: finalUrl || metadata.playback_mp4 || null,
        playback_url: finalUrl || metadata.playback_url || null,
        playback_provider: finalUrl ? 'r2' : metadata.playback_provider,
        playback_type: finalUrl ? 'mp4' : 'processing',
        thumbnail_url: replay?.thumbnail_url || metadata.thumbnail_url || null,
        processing_message: nextProcessingMessage,
        recording_error: replay?.error_message || metadata.recording_error || null,
      },
    };
  });
}

export const useProfile = () => {
  const navigate = useNavigate();
  const { userId, username } = useParams();
  const { userId: authUserId } = useCurrentUser();
  const currentUserId = authUserId || '';
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [allPosts, setAllPosts] = useState<ProfilePostItem[]>([]);
  const [originalPosts, setOriginalPosts] = useState<OriginalProfilePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimelinePosts, setHasMoreTimelinePosts] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [friendsCount, setFriendsCount] = useState(0);
  const [friendsPreview, setFriendsPreview] = useState<FriendPreview[]>([]);
  const [activeTab, setActiveTab] = usePersistedTab('profile-tab', 'posts', ['posts', 'about', 'friends', 'photos', 'videos', 'honorboard', 'edit'] as const);
  const { isAdmin } = useAdminRole();
  const [displayedCount, setDisplayedCount] = useState(POSTS_PER_PAGE);
  const [viewAsPublic, setViewAsPublic] = useState(false);
  const [showAvatarViewer, setShowAvatarViewer] = useState(false);

  const showPrivateElements = isOwnProfile && !viewAsPublic;

  // Use refs to stabilize fetchProfile and prevent race conditions
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const fetchRequestIdRef = useRef(0);
  const activeProfileIdRef = useRef<string | null>(null);
  const backgroundRefreshInFlightRef = useRef(false);
  const lastRealtimeRefreshAtRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const visibleProfilePostIdsRef = useRef<Set<string>>(new Set());
  const visibleLiveSessionIdsRef = useRef<Set<string>>(new Set());

  const fetchTimelinePage = useCallback(async (profileId: string, cursor: string | null) => {
    const startedAt = performance.now();
    const mapProfiles = <T extends { public_profiles?: ProfilePostProfile; profiles?: ProfilePostProfile }>(posts: T[]): (T & { profiles: ProfilePostProfile })[] =>
      (posts || []).map((p) => ({
        ...p,
        profiles: (p.public_profiles || p.profiles || { username: 'unknown', avatar_url: null }) as ProfilePostProfile,
      }));

    let postsQuery = supabase
      .from('posts')
      .select(PROFILE_POST_SELECT)
      .eq('user_id', profileId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(TIMELINE_QUERY_LIMIT);

    let giftSenderQuery = supabase
      .from('posts')
      .select(PROFILE_POST_SELECT)
      .eq('gift_sender_id', profileId)
      .eq('post_type', 'gift_celebration')
      .neq('user_id', profileId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(TIMELINE_QUERY_LIMIT);

    // Đường đọc nóng: RPC SECURITY DEFINER thay cho embed shared_posts -> posts
    // (giữ nguyên 100% quy tắc hiển thị của RLS gốc, xem migration get_profile_shared_posts).
    const sharedQuery = supabase.rpc('get_profile_shared_posts', {
      p_user_id: profileId,
      p_limit: TIMELINE_QUERY_LIMIT,
      p_offset: 0,
      p_cursor: cursor ?? null,
    });

    if (cursor) {
      postsQuery = postsQuery.lt('created_at', cursor);
      giftSenderQuery = giftSenderQuery.lt('created_at', cursor);
    }

    const [postsRes, giftSenderRes, sharedRes] = await Promise.all([postsQuery, giftSenderQuery, sharedQuery]);
    if (postsRes.error) throw postsRes.error;
    if (giftSenderRes.error) throw giftSenderRes.error;
    if (sharedRes.error) throw sharedRes.error;


    const postsData = postsRes.data || [];
    const giftSenderPosts = giftSenderRes.data || [];
    const scopedPostsData = postsData.filter((post) => post.user_id === profileId);
    const scopedGiftSenderPosts = giftSenderPosts.filter((post) => post.gift_sender_id === profileId && post.user_id !== profileId);

    if (import.meta.env.DEV) {
      const leakedOriginals = postsData.filter((post) => post.user_id !== profileId);
      const leakedGiftSender = giftSenderPosts.filter((post) => post.gift_sender_id !== profileId || post.user_id === profileId);
      if (leakedOriginals.length || leakedGiftSender.length) {
        console.warn('[useProfile] dropped posts outside active profile scope', {
          profileId,
          leakedOriginalIds: leakedOriginals.map((post) => post.id),
          leakedGiftSenderIds: leakedGiftSender.map((post) => post.id),
        });
      }
    }

    const existingPostIds = new Set(scopedPostsData.map((p) => p.id));
    const rawAllUserPosts = [
      ...mapProfiles(scopedPostsData),
      ...mapProfiles(scopedGiftSenderPosts).filter((p) => !existingPostIds.has(p.id))
    ];
    const liveHydrationStartedAt = performance.now();
    const allUserPosts = await hydrateProfileLivePosts(rawAllUserPosts as unknown as BasePostFields[]);

    const giftPostsInProfile = allUserPosts.filter(p => p.post_type === 'gift_celebration');
    const profileIdsToFetch = new Set<string>();
    giftPostsInProfile.forEach(p => {
      if (p.gift_recipient_id) profileIdsToFetch.add(p.gift_recipient_id);
      if (p.gift_sender_id && p.gift_sender_id !== p.user_id) profileIdsToFetch.add(p.gift_sender_id);
    });

    type GiftProfile = { id: string; username: string; display_name?: string | null; avatar_url: string | null };
    const giftProfilesRes = profileIdsToFetch.size > 0
      ? await supabase.from('public_profiles').select('id, username, display_name, avatar_url, is_live, current_live_session_id, live_started_at').in('id', Array.from(profileIdsToFetch))
      : { data: [] as GiftProfile[] };

    const giftProfileMap = new Map<string, { username: string; display_name?: string | null; avatar_url: string | null }>();
    (giftProfilesRes.data || []).forEach((p) => giftProfileMap.set(p.id, p));

    const allUserPostsWithGiftProfiles: OriginalProfilePost[] = allUserPosts.map(post => {
      const base = {
        ...post,
        _type: 'original' as const,
        _sortTime: new Date(post.created_at).getTime(),
      } as OriginalProfilePost;
      if (post.post_type !== 'gift_celebration') return base;
      return {
        ...base,
        recipientProfile: post.gift_recipient_id ? (giftProfileMap.get(post.gift_recipient_id) || null) : null,
        senderProfile: (post.gift_sender_id && post.gift_sender_id !== post.user_id)
          ? (giftProfileMap.get(post.gift_sender_id) || null) : null,
      };
    });

    const combinedPosts: ProfilePostItem[] = [...allUserPostsWithGiftProfiles];
    const sharedRows = sharedRes.data || [];

    const sharedMappedPosts = sharedRows
      .map((sharedPost: any) => {
        if (sharedPost.user_id !== profileId) {
          if (import.meta.env.DEV) {
            console.warn('[useProfile] dropped shared post outside active profile scope', {
              profileId,
              sharedPostId: sharedPost.id,
              sharedUserId: sharedPost.user_id,
            });
          }
          return null;
        }
        const original = sharedPost.posts;
        if (!original || (original as { deleted_at?: string | null }).deleted_at) return null;
        const raw = original as unknown as { public_profiles?: ProfilePostProfile; profiles?: ProfilePostProfile };
        return {
          sharedPost,
          mappedPost: { ...(original as object), profiles: raw.public_profiles || raw.profiles || { username: 'unknown', avatar_url: null } } as BasePostFields,
        };
      })
      .filter(Boolean) as Array<{ sharedPost: any; mappedPost: BasePostFields }>;

    sharedMappedPosts.forEach(({ sharedPost, mappedPost }) => {
      combinedPosts.push({
        ...sharedPost,
        posts: mappedPost,
        _type: 'shared',
        _sortTime: new Date(sharedPost.created_at).getTime(),
      } as unknown as SharedProfilePost);
    });

    combinedPosts.sort((a, b) => b._sortTime - a._sortTime);
    const hasMore = postsData.length >= TIMELINE_QUERY_LIMIT
      || giftSenderPosts.length >= TIMELINE_QUERY_LIMIT
      || sharedRows.length >= TIMELINE_QUERY_LIMIT
      || combinedPosts.length > POSTS_PER_PAGE;
    const pagePosts = combinedPosts.slice(0, POSTS_PER_PAGE);
    const nextCursor = hasMore && pagePosts.length > 0
      ? new Date(pagePosts[pagePosts.length - 1]._sortTime).toISOString()
      : null;

    if (import.meta.env.DEV) {
      console.debug('[useProfile] timeline page timing', {
        profileId,
        cursor,
        sourceCounts: {
          original: postsData.length,
          giftSender: giftSenderPosts.length,
          shared: sharedRows.length,
        },
        returned: pagePosts.length,
        liveHydrationMs: Math.round(performance.now() - liveHydrationStartedAt),
        totalMs: Math.round(performance.now() - startedAt),
      });
    }

    return {
      posts: pagePosts,
      originals: pagePosts.filter((post): post is OriginalProfilePost => post._type === 'original'),
      cursor: nextCursor,
      hasMore,
    };
  }, []);

  const fetchFriendsPreview = useCallback(async (profileId: string) => {
    const friendsRes = await supabase
      .from('friendships')
      .select('user_id, friend_id', { count: 'exact' })
      .or(`user_id.eq.${profileId},friend_id.eq.${profileId}`)
      .eq('status', 'accepted')
      .limit(6);

    const friendIds = (friendsRes.data || []).map(f => f.user_id === profileId ? f.friend_id : f.user_id);
    const friendProfilesRes = friendIds.length > 0
      ? await supabase.from('public_profiles').select('id, username, full_name, avatar_url, is_live, current_live_session_id, live_started_at').in('id', friendIds).limit(6)
      : { data: [] as FriendPreview[] };

    return {
      count: friendsRes.count || 0,
      preview: (friendProfilesRes.data || []) as FriendPreview[],
    };
  }, []);

  const fetchProfile = useCallback(async (profileId: string, authUserId?: string, mode: ProfileFetchMode = 'initial') => {
    if (mode !== 'initial' && backgroundRefreshInFlightRef.current) return;
    if (mode !== 'initial') backgroundRefreshInFlightRef.current = true;
    const requestId = ++fetchRequestIdRef.current;
    activeProfileIdRef.current = profileId;
    const isStale = () => fetchRequestIdRef.current !== requestId || activeProfileIdRef.current !== profileId;
    const startedAt = performance.now();
    const isInitial = mode === 'initial';
    const shouldFetchHeader = mode !== 'timelineOnly';
    try {
      const isViewingOwnProfile = authUserId ? profileId === authUserId : profileId === currentUserIdRef.current;
      if (isInitial) {
        setLoading(true);
        setAllPosts([]);
        setOriginalPosts([]);
      }
      setTimelineLoading(true);
      setLoadingMorePosts(false);
      setTimelineCursor(null);
      setHasMoreTimelinePosts(false);

      if (shouldFetchHeader) {
        const profileStartedAt = performance.now();
        const profileRes = await (isViewingOwnProfile
          ? supabase.from('profiles').select(OWN_PROFILE_COLUMNS).eq('id', profileId).single()
          : supabase.from('public_profiles')
              .select('id, username, display_name, avatar_url, full_name, bio, cover_url, created_at, public_wallet_address, btc_address, social_links, is_banned, location, workplace, education, relationship_status, is_live, current_live_session_id, live_started_at')
              .eq('id', profileId).single());

        let headerData = profileRes.data as ProfileData | null;

        if (profileRes.error) {
          console.error('[useProfile] profile header query failed', {
            profileId,
            authUserId: authUserId ?? currentUserIdRef.current,
            isViewingOwnProfile,
            source: isViewingOwnProfile ? 'profiles' : 'public_profiles',
            error: profileRes.error,
          });
          // Fallback: khi truy vấn bảng profiles (own) lỗi, thử view công khai
          if (!isViewingOwnProfile) throw profileRes.error;
          const fallback = await supabase.from('public_profiles')
            .select('id, username, display_name, avatar_url, full_name, bio, cover_url, created_at, public_wallet_address, btc_address, social_links, is_banned, location, workplace, education, relationship_status, is_live, current_live_session_id, live_started_at')
            .eq('id', profileId).maybeSingle();
          if (!fallback.data) throw profileRes.error;
          headerData = fallback.data as ProfileData;
        }

        if (isStale()) return;

        const data = headerData as ProfileData;
        if (isInitial && userId && data?.username) {
          window.history.replaceState(null, '', `/${encodeURIComponent((data.username || '').trim())}`);
        }

        setProfile(data);
        if (isInitial) setLoading(false);

        if (import.meta.env.DEV) {
          console.debug('[useProfile] profile header timing', {
            profileId,
            mode,
            ms: Math.round(performance.now() - profileStartedAt),
          });
        }

        fetchFriendsPreview(profileId)
          .then((friends) => {
            if (isStale()) return;
            setFriendsCount(friends.count);
            setFriendsPreview(friends.preview);
          })
          .catch((error) => console.error('Error fetching profile friends preview:', error));
      }

      const timeline = await fetchTimelinePage(profileId, null);
      if (isStale()) return;
      setAllPosts(timeline.posts);
      setOriginalPosts(timeline.originals);
      setTimelineCursor(timeline.cursor);
      setHasMoreTimelinePosts(timeline.hasMore);

      if (import.meta.env.DEV) {
        console.debug('[useProfile] total initial load timing', {
          profileId,
          mode,
          ms: Math.round(performance.now() - startedAt),
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      if (!isStale()) {
        if (isInitial) setLoading(false);
        setTimelineLoading(false);
      }
      if (mode !== 'initial') backgroundRefreshInFlightRef.current = false;
    }
  }, [fetchFriendsPreview, fetchTimelinePage, userId]);

  useEffect(() => {
    let cancelled = false;

    fetchRequestIdRef.current += 1;
    activeProfileIdRef.current = null;
    setIsOwnProfile(false);
    setProfile(null);
    setAllPosts([]);
    setOriginalPosts([]);
    setFriendsPreview([]);
    setFriendsCount(0);
    setDisplayedCount(POSTS_PER_PAGE);
    setTimelineCursor(null);
    setHasMoreTimelinePosts(false);
    setTimelineLoading(true);
    setLoadingMorePosts(false);
    setLoading(true);

    if (username && reservedPaths.includes(username.toLowerCase())) {
      navigate(`/${username}`);
      return;
    }
    
    if (username) {
      const cleanUsername = decodeURIComponent(username.startsWith('@') ? username.slice(1) : username).trim();
      supabase
        .from('public_profiles')
        .select('id')
        .eq('username_normalized', cleanUsername.toLowerCase())
        .single()
        .then(({ data: profileData }) => {
          if (cancelled) return;
          if (profileData) {
            activeProfileIdRef.current = profileData.id;
            setIsOwnProfile(currentUserId ? profileData.id === currentUserId : false);
            fetchProfile(profileData.id, currentUserId || undefined);
          } else {
            supabase
              .from('username_history')
              .select('new_username')
              .eq('old_username', cleanUsername)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
              .then(({ data: history }) => {
                if (cancelled) return;
                if (history?.new_username) {
                  navigate(`/${history.new_username}`, { replace: true });
                } else {
                  setLoading(false);
                  setTimelineLoading(false);
                  setProfile(null);
                }
              });
          }
        });
      return () => { cancelled = true; };
    }
    
    let profileId = userId;
    if (!userId) {
      if (currentUserId) {
        profileId = currentUserId;
      } else {
        navigate('/', { replace: true });
        return;
      }
    }
    
    setIsOwnProfile(currentUserId ? profileId === currentUserId : false);
    activeProfileIdRef.current = profileId!;
    fetchProfile(profileId!, currentUserId || undefined);

    return () => { cancelled = true; };
  }, [navigate, userId, username, fetchProfile, currentUserId]);

  const scrollToTabs = useCallback(() => {
    setTimeout(() => {
      const tabsEl = document.getElementById('profile-tabs');
      if (!tabsEl) return;
      const scrollContainer = document.querySelector('[data-app-scroll]') as HTMLElement | null;
      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const tabsRect = tabsEl.getBoundingClientRect();
        const offset = tabsRect.top - containerRect.top + scrollContainer.scrollTop;
        scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
      } else {
        tabsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  const navigateToTab = useCallback((tab: string) => {
    setActiveTab(tab);
    scrollToTabs();
  }, [scrollToTabs]);

  const sortedPosts = useMemo(() => {
    if (!profile?.pinned_post_id) return allPosts;
    const pinnedPost = allPosts.find(
      (item) => item._type === 'original' && item.id === profile.pinned_post_id
    );
    if (!pinnedPost) return allPosts;
    const otherPosts = allPosts.filter(
      (item) => !(item._type === 'original' && item.id === profile.pinned_post_id)
    );
    return [pinnedPost, ...otherPosts];
  }, [allPosts, profile?.pinned_post_id]);

  const displayedPosts = sortedPosts;
  const hasMorePosts = hasMoreTimelinePosts;

  const buildInitialStats = useCallback((post: ProfilePostItem): PostStats | undefined => {
    if (post._type === 'shared') return undefined;
    const orig = post as OriginalProfilePost;
    if (!orig.reactions && !orig.comments) return undefined;
    return {
      reactions: (orig.reactions || []).map((r) => ({ id: r.id, user_id: r.user_id, type: r.type })),
      commentCount: (orig.comments || []).length,
      shareCount: 0,
    };
  }, []);

  useEffect(() => {
    const postIds = new Set<string>();
    const liveSessionIds = new Set<string>();
    const collectPost = (post: BasePostFields | null | undefined) => {
      if (!post?.id) return;
      postIds.add(post.id);
      const metadata = isRecord(post.metadata) ? post.metadata : {};
      const liveSessionId = typeof metadata.live_session_id === 'string' ? metadata.live_session_id : null;
      if (liveSessionId) liveSessionIds.add(liveSessionId);
    };

    allPosts.forEach((item) => {
      if (item._type === 'shared') {
        collectPost(item.posts as BasePostFields);
        if (item.id) postIds.add(item.id);
      } else {
        collectPost(item as BasePostFields);
      }
    });

    visibleProfilePostIdsRef.current = postIds;
    visibleLiveSessionIdsRef.current = liveSessionIds;
  }, [allPosts]);

  useEffect(() => {
    setDisplayedCount(POSTS_PER_PAGE);
  }, [profile?.id]);

  const loadMorePosts = useCallback(async () => {
    const profileId = activeProfileIdRef.current;
    if (!profileId || !timelineCursor || loadingMorePosts) return;
    const requestId = fetchRequestIdRef.current;
    const isStale = () => fetchRequestIdRef.current !== requestId || activeProfileIdRef.current !== profileId;
    setLoadingMorePosts(true);
    try {
      const page = await fetchTimelinePage(profileId, timelineCursor);
      if (isStale()) return;
      setAllPosts((prev) => {
        const byKey = new Map(prev.map((item) => [`${item._type}:${item.id}`, item]));
        page.posts.forEach((item) => byKey.set(`${item._type}:${item.id}`, item));
        return Array.from(byKey.values()).sort((a, b) => b._sortTime - a._sortTime);
      });
      setOriginalPosts((prev) => {
        const byId = new Map(prev.map((item) => [item.id, item]));
        page.originals.forEach((item) => byId.set(item.id, item));
        return Array.from(byId.values()).sort((a, b) => b._sortTime - a._sortTime);
      });
      setTimelineCursor(page.cursor);
      setHasMoreTimelinePosts(page.hasMore);
    } catch (error) {
      console.error('Error loading more profile posts:', error);
    } finally {
      if (!isStale()) setLoadingMorePosts(false);
    }
  }, [fetchTimelinePage, loadingMorePosts, timelineCursor]);

  const handleRefresh = useCallback(async () => {
    const profileId = activeProfileIdRef.current;
    if (!profileId) return;
    await fetchProfile(profileId, currentUserId, 'background');
  }, [currentUserId, fetchProfile]);

  useEffect(() => {
    if (!profile?.id) return;

    const subscriptionProfileId = profile.id;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = (mode: ProfileFetchMode = 'timelineOnly') => {
      if (activeProfileIdRef.current !== subscriptionProfileId) return;
      const now = Date.now();
      const elapsed = now - lastRealtimeRefreshAtRef.current;
      if (elapsed < PROFILE_REALTIME_REFRESH_MIN_INTERVAL_MS) return;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (activeProfileIdRef.current !== subscriptionProfileId) return;
        lastRealtimeRefreshAtRef.current = Date.now();
        fetchProfile(subscriptionProfileId, currentUserId, mode);
      }, PROFILE_REALTIME_REFRESH_DEBOUNCE_MS);
    };

    const handleVisible = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (!hiddenAt || Date.now() - hiddenAt < PROFILE_VISIBILITY_REFRESH_STALE_MS) return;
      scheduleRefresh('background');
    };
    document.addEventListener('visibilitychange', handleVisible);

    const channel = supabase
      .channel(`profile-live-media-${subscriptionProfileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts', filter: `user_id=eq.${subscriptionProfileId}` },
        (payload: any) => {
          const row = payload?.new || payload?.old || {};
          if (row?.user_id !== subscriptionProfileId) return;
          const metadata = isRecord(row?.metadata) ? row.metadata : {};
          if (row?.post_type === 'live' || row?.post_type === 'live_replay' || metadata.live_session_id || metadata.live_status || row?.video_url) {
            scheduleRefresh();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_sessions' },
        (payload: any) => {
          const row = payload?.new || payload?.old || {};
          if (row?.host_user_id === subscriptionProfileId || row?.owner_id === subscriptionProfileId || row?.user_id === subscriptionProfileId) {
            scheduleRefresh();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_replays' },
        async (payload: any) => {
          const row = payload?.new || payload?.old || {};
          const replayPostId = typeof row?.replay_post_id === 'string' ? row.replay_post_id : null;
          const liveSessionId = typeof row?.live_session_id === 'string' ? row.live_session_id : null;
          if (
            (replayPostId && visibleProfilePostIdsRef.current.has(replayPostId)) ||
            (liveSessionId && visibleLiveSessionIdsRef.current.has(liveSessionId))
          ) {
            scheduleRefresh();
            return;
          }
          if (!liveSessionId || !UUID_RE.test(liveSessionId)) return;
          const { data } = await supabase
            .from('live_sessions')
            .select('host_user_id, owner_id, user_id')
            .eq('id', liveSessionId)
            .maybeSingle();
          if (activeProfileIdRef.current !== subscriptionProfileId) return;
          if (data?.host_user_id === subscriptionProfileId || data?.owner_id === subscriptionProfileId || data?.user_id === subscriptionProfileId) {
            scheduleRefresh();
          }
        },
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisible);
      supabase.removeChannel(channel);
    };
  }, [profile?.id, currentUserId, fetchProfile]);

  return {
    profile,
    setProfile,
    loading,
    timelineLoading,
    loadingMorePosts,
    currentUserId,
    isOwnProfile,
    friendsCount,
    friendsPreview,
    activeTab,
    setActiveTab,
    isAdmin,
    displayedCount,
    setDisplayedCount,
    viewAsPublic,
    setViewAsPublic,
    showAvatarViewer,
    setShowAvatarViewer,
    showPrivateElements,
    originalPosts,
    sortedPosts,
    displayedPosts,
    hasMorePosts,
    buildInitialStats,
    navigateToTab,
    loadMorePosts,
    fetchProfile,
    handleRefresh,
    POSTS_PER_PAGE,
  };
};
