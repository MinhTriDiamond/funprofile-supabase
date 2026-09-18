ALTER TABLE public.shared_posts
ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

ALTER TABLE public.shared_posts
DROP CONSTRAINT IF EXISTS shared_posts_visibility_check;

ALTER TABLE public.shared_posts
ADD CONSTRAINT shared_posts_visibility_check
CHECK (visibility IN ('public', 'friends', 'private'));

CREATE INDEX IF NOT EXISTS idx_shared_posts_visibility_created
ON public.shared_posts(visibility, created_at DESC);

DROP POLICY IF EXISTS "Shared posts are viewable by everyone" ON public.shared_posts;
DROP POLICY IF EXISTS "Shared posts are viewable by allowed audience" ON public.shared_posts;

CREATE POLICY "Shared posts are viewable by allowed audience"
ON public.shared_posts FOR SELECT
USING (
  (
    visibility = 'public'
    OR user_id = auth.uid()
    OR (
      visibility = 'friends'
      AND EXISTS (
        SELECT 1
        FROM public.friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.user_id = shared_posts.user_id AND f.friend_id = auth.uid())
            OR (f.friend_id = shared_posts.user_id AND f.user_id = auth.uid())
          )
      )
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = shared_posts.original_post_id
      AND p.deleted_at IS NULL
      AND (
        p.visibility = 'public'
        OR p.user_id = auth.uid()
        OR (
          p.visibility = 'friends'
          AND EXISTS (
            SELECT 1
            FROM public.friendships f
            WHERE f.status = 'accepted'
              AND (
                (f.user_id = p.user_id AND f.friend_id = auth.uid())
                OR (f.friend_id = p.user_id AND f.user_id = auth.uid())
              )
          )
        )
      )
  )
);