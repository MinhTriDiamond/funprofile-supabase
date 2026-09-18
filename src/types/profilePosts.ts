/**
 * Typed definitions for profile posts — covers 3 shapes:
 * 1. OriginalProfilePost (regular + gift_celebration)
 * 2. SharedProfilePost (shared posts with nested original)
 *
 * Replaces `any[]` in useProfile.ts
 */

export interface ProfilePostProfile {
  username: string;
  display_name?: string | null;
  avatar_url: string | null;
  full_name?: string | null;
  public_wallet_address?: string | null;
  is_live?: boolean | null;
  current_live_session_id?: string | null;
  live_started_at?: string | null;
}

export interface ProfilePostReaction {
  id: string;
  user_id: string;
  type: string;
}

export interface ProfilePostComment {
  id: string;
}

/** Base fields shared by all post rows — uses permissive types for Supabase compatibility */
export interface BasePostFields {
  id: string;
  content: string;
  image_url: string | null;
  video_url?: string | null;
  media_urls?: unknown;
  created_at: string;
  user_id: string;
  visibility?: string;
  post_type?: string;
  slug?: string | null;
  gift_sender_id?: string | null;
  gift_recipient_id?: string | null;
  metadata?: unknown;
  profiles: ProfilePostProfile;
  /** Raw Supabase join alias — mapped to `profiles` in mapProfiles */
  public_profiles?: ProfilePostProfile;
  reactions?: ProfilePostReaction[];
  comments?: ProfilePostComment[];
  pinned_post_id?: string | null;
  is_reward_eligible?: boolean;
  [key: string]: unknown;
}

/** An original post (including gift_celebration) on the profile timeline */
export interface OriginalProfilePost extends BasePostFields {
  _type: 'original';
  _sortTime: number;
  /** Gift-specific enrichment (only when post_type === 'gift_celebration') */
  recipientProfile?: { username: string; display_name?: string | null; avatar_url: string | null } | null;
  senderProfile?: { username: string; display_name?: string | null; avatar_url: string | null } | null;
}

/** A shared post on the profile timeline */
export interface SharedProfilePost {
  _type: 'shared';
  _sortTime: number;
  id: string;
  user_id: string;
  original_post_id: string;
  created_at: string;
  content?: string | null;
  caption?: string | null;
  visibility?: string;
  posts: BasePostFields | null;
  [key: string]: unknown;
}

/** Union type for all posts displayed on the profile page */
export type ProfilePostItem = OriginalProfilePost | SharedProfilePost;
