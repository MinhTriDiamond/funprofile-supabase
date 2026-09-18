-- Add location column to posts table for check-in feature
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS location TEXT;

-- Create post_tags table for friend tagging
CREATE TABLE IF NOT EXISTS public.post_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tagged_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, tagged_user_id)
);

-- Enable RLS on post_tags
ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view tags on posts they can see
CREATE POLICY "Anyone can view post tags"
ON public.post_tags FOR SELECT
USING (true);

-- Policy: Post author can tag friends
CREATE POLICY "Post author can tag friends"
ON public.post_tags FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.posts 
    WHERE id = post_id AND user_id = auth.uid()
  )
);

-- Policy: Post author can remove tags
CREATE POLICY "Post author can remove tags"
ON public.post_tags FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.posts 
    WHERE id = post_id AND user_id = auth.uid()
  )
);

-- Policy: Tagged user can remove their own tag
CREATE POLICY "Tagged user can remove their own tag"
ON public.post_tags FOR DELETE
USING (tagged_user_id = auth.uid());

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON public.post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_user_id ON public.post_tags(tagged_user_id);