export interface PostMetadata {
  live_status?: 'live' | 'ended' | string;
  live_session_id?: string;
  status?: string;
  host_connection_status?: string | null;
  last_seen_at?: string | null;
  last_host_heartbeat_at?: string | null;
  ended_at?: string | null;
  thumbnail_url?: string;
  recording_failed?: boolean;
  fallback_playback_url?: string;
  playback_hls?: string;
  playback_type?: 'cloudflare_stream' | 'cloudflare_stream_pending' | 'chunked' | string;
  allow_chunked_fallback?: boolean;
  stream_uid?: string;
  [key: string]: unknown;
}

export interface PostData {
  id: string;
  slug?: string | null;
  public_id?: string | null;
  share_code?: string | null;
  content: string;
  image_url: string | null;
  video_url?: string | null;
  media_urls?: Array<{ url: string; type: 'image' | 'video' }> | null;
  created_at: string;
  user_id: string;
  visibility?: string;
  post_type?: string;
  replay_status?: string | null;
  replay_ready?: boolean | null;
  playback_provider?: string | null;
  processing_message?: string | null;
  metadata?: PostMetadata | null;
  profiles: {
    username: string;
    display_name?: string | null;
    avatar_url: string | null;
    public_wallet_address?: string | null;
    is_live?: boolean | null;
    current_live_session_id?: string | null;
    live_started_at?: string | null;
  };
}

export interface SharedPostData {
  id: string;
  user_id: string;
  original_post_id: string;
  caption?: string | null;
  visibility?: 'public' | 'friends' | 'private' | string;
  created_at: string;
  profiles: {
    username: string;
    display_name?: string | null;
    avatar_url: string | null;
    public_wallet_address?: string | null;
    is_live?: boolean | null;
    current_live_session_id?: string | null;
    live_started_at?: string | null;
  };
  posts: PostData | null;
}

export interface PostStats {
  reactions: { id: string; user_id: string; type: string }[];
  commentCount: number;
  shareCount: number;
}

export interface ReactionCount {
  type: string;
  count: number;
}

export interface FacebookPostCardProps {
  post: PostData;
  currentUserId: string;
  onPostDeleted: () => void;
  initialStats?: PostStats;
  isPinned?: boolean;
  onPinPost?: (postId: string) => void;
  onUnpinPost?: () => void;
  isOwnProfile?: boolean;
  viewAsPublic?: boolean;
  disableRealtime?: boolean;
}
