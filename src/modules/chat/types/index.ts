import { Json } from '@/integrations/supabase/types';

// Profile type
export interface UserProfile {
  id: string;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
  wallet_address?: string | null;
  external_wallet_address?: string | null;
  
}

// Conversation types
export interface Conversation {
  id: string;
  type: string;
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string | null;
  updated_at: string | null;
  participants?: ConversationParticipant[];
  unread_count?: number;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string | null;
  nickname: string | null;
  joined_at: string | null;
  left_at: string | null;
  muted_until?: string | null;
  profile?: UserProfile;
}

// Message types
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_urls: Json | null;
  reply_to_id: string | null;
  message_type?: 'text' | 'sticker' | 'red_envelope' | 'system' | string;
  metadata?: Json | null;
  edited_at?: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
  is_deleted: boolean | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  sender?: UserProfile;
  reply_to?: Message | null;
  reactions?: MessageReaction[];
  read_by?: string[];
}

export interface MessageReaction {
  id: string;
  message_id?: string;
  user_id: string;
  emoji: string;
  created_at?: string | null;
}

export interface UserBlock {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string | null;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface StickerPack {
  id: string;
  name: string;
  description: string | null;
  preview_url: string | null;
  is_free: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
}

export interface Sticker {
  id: string;
  pack_id: string;
  name: string;
  url: string;
  is_animated: boolean;
  sort_order: number;
}

export interface RedEnvelope {
  id: string;
  creator_id: string;
  conversation_id: string;
  message_id: string | null;
  token: 'CAMLY' | 'BNB' | string;
  total_amount: number;
  total_count: number;
  remaining_amount: number;
  remaining_count: number;
  expires_at: string;
  status: 'active' | 'expired' | 'fully_claimed' | string;
  created_at: string | null;
}

export interface RedEnvelopeClaim {
  id: string;
  envelope_id: string;
  claimer_id: string;
  amount: number;
  claimed_at: string;
}

// Call types
export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallType = 'voice' | 'video';

export interface CallSession {
  id: string;
  conversation_id: string;
  initiator_id: string;
  call_type: CallType;
  status: string;
  channel_name: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
}

export interface RemoteUser {
  uid: import('agora-rtc-sdk-ng').UID;
  audioTrack?: any;
  videoTrack?: any;
  hasAudio: boolean;
  hasVideo: boolean;
}

// Media devices
export interface MediaDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
}

export interface NetworkQuality {
  uplink: number; // 0-5 (0=unknown, 1=excellent, 5=bad)
  downlink: number;
}

// Chat settings
export interface ChatSettings {
  id: string;
  user_id: string;
  who_can_message: string | null;
  show_read_receipts: boolean | null;
  show_typing_indicator: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// Typing indicator
export interface TypingUser {
  userId: string;
  username: string;
  avatar_url?: string;
}
