/**
 * Typed row interfaces for Supabase realtime payloads.
 * Used instead of `payload.new as any` in realtime subscriptions.
 */

/** live_comments table row */
export interface LiveCommentRow {
  id: string;
  live_session_id: string;
  user_id: string;
  message: string;
  created_at: string;
}

/** live_reactions table row */
export interface LiveReactionRow {
  id: number;
  session_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

/** live_messages table row */
export interface LiveMessageRow {
  id: number;
  session_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

/** messages table row (chat) */
export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_urls: unknown;
  reply_to_id: string | null;
  is_deleted: boolean | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  message_type: string;
  metadata: unknown;
  pinned_at: string | null;
  pinned_by: string | null;
  edited_at: string | null;
}

/** message_reactions table row */
export interface MessageReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string | null;
}

/** message_reads table row */
export interface MessageReadRow {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string | null;
}

/** call_sessions table row */
export interface CallSessionRow {
  id: string;
  conversation_id: string | null;
  initiator_id: string;
  call_type: string;
  status: string;
  channel_name: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Chat message metadata interfaces */
export interface StickerMetadata {
  sticker?: { url?: string; name?: string };
}

export interface RedEnvelopeMetadata {
  envelopeId?: string;
  envelope_id?: string;
  amount?: number;
}
