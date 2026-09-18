-- Add visibility column to posts table for privacy control
ALTER TABLE public.posts 
ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';

-- Add index for faster filtering
CREATE INDEX idx_posts_visibility ON public.posts(visibility);

-- Update RLS policy to respect visibility
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;

-- New policy: Public posts visible to everyone, private posts only to owner
CREATE POLICY "Posts visibility based on setting"
ON public.posts
FOR SELECT
USING (
  visibility = 'public' 
  OR user_id = auth.uid()
  OR (visibility = 'friends' AND EXISTS (
    SELECT 1 FROM friendships 
    WHERE status = 'accepted' 
    AND ((user_id = auth.uid() AND friend_id = posts.user_id) 
      OR (friend_id = auth.uid() AND user_id = posts.user_id))
  ))
);

-- Add comment to document the column
COMMENT ON COLUMN public.posts.visibility IS 'Post visibility: public, friends, private';