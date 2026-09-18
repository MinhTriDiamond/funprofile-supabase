
-- Phase 1A: Performance Indexes
-- Những index này tối ưu các query phổ biến nhất trong app

-- Notifications: user_id + read (dùng cho badge count + dropdown filter)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);

-- Reactions: post_id + type (dùng cho reaction counts per post)
CREATE INDEX IF NOT EXISTS idx_reactions_post_type ON public.reactions(post_id, type);

-- Light Actions: user_id + created_at DESC (dùng cho Light Score history)
CREATE INDEX IF NOT EXISTS idx_light_actions_user_created ON public.light_actions(user_id, created_at DESC);

-- Posts: user_id + created_at DESC (dùng cho profile feed)
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON public.posts(user_id, created_at DESC);

-- Chunked Recording Chunks: status (dùng cho cleanup queries)
CREATE INDEX IF NOT EXISTS idx_chunked_chunks_status ON public.chunked_recording_chunks(status);

-- Donations: sender_id + status (dùng cho benefactor leaderboard)
CREATE INDEX IF NOT EXISTS idx_donations_sender_status ON public.donations(sender_id, status);

-- Donations: recipient_id + status (dùng cho recipient leaderboard)
CREATE INDEX IF NOT EXISTS idx_donations_recipient_status ON public.donations(recipient_id, status);

-- Comments: post_id + created_at (dùng cho comment thread load)
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON public.comments(post_id, created_at);

-- Friendships: composite cho friend lookup
CREATE INDEX IF NOT EXISTS idx_friendships_user_status ON public.friendships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_status ON public.friendships(friend_id, status);
