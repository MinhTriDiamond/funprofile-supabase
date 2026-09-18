
-- Unique constraint: same old_slug per content item should only appear once
CREATE UNIQUE INDEX IF NOT EXISTS uq_slug_history_content_oldslug
  ON public.slug_history(content_id, old_slug);

-- Fast lookup index for slug resolution: (content_type, user_id, old_slug)
-- Already exists as idx_slug_history_lookup, but ensure it's unique-safe
-- No action needed, existing index covers this.

-- Add composite index for faster content lookups by user+type+created
CREATE INDEX IF NOT EXISTS ix_posts_user_created
  ON public.posts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_reels_user_created
  ON public.reels(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_live_sessions_owner_created
  ON public.live_sessions(owner_id, created_at DESC);
