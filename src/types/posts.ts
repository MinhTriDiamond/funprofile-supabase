/**
 * Post and Feed Types
 * Shared type definitions for posts and feed components
 */

export interface PostProfile {
  username: string;
  avatar_url: string | null;
}

export interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

export interface Post {
  id: string;
  content: string;
  image_url: string | null;
  video_url?: string | null;
  media_urls?: MediaItem[] | null;
  created_at: string;
  updated_at?: string;
  user_id: string;
  visibility?: string;
  profiles: PostProfile;
  videoMeta?: {
    width?: number;
    height?: number;
    duration?: number;
    isLiveReplay?: boolean;
    displayMode?: 'square' | 'rectangle';
  };
}

export interface PostReaction {
  id: string;
  user_id: string;
  type: string;
}

export interface PostStats {
  reactions: PostReaction[];
  commentCount: number;
  shareCount: number;
}

export interface ReactionCount {
  type: string;
  count: number;
}

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';

export interface Comment {
  id: string;
  content: string;
  post_id: string;
  user_id: string;
  parent_comment_id: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
}
