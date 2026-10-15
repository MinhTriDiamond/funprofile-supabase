CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_gift_sender_created
  ON public.posts (gift_sender_id, created_at DESC)
  WHERE post_type = 'gift_celebration' AND deleted_at IS NULL;
