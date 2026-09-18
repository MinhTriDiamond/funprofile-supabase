-- Add video_url column to posts table
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Create shared_posts table for reposting functionality
CREATE TABLE IF NOT EXISTS public.shared_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  original_post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on shared_posts
ALTER TABLE public.shared_posts ENABLE ROW LEVEL SECURITY;

-- RLS policies for shared_posts
CREATE POLICY "Shared posts are viewable by everyone"
ON public.shared_posts FOR SELECT
USING (true);

CREATE POLICY "Users can share posts"
ON public.shared_posts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shared posts"
ON public.shared_posts FOR DELETE
USING (auth.uid() = user_id);

-- Create videos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for videos bucket
CREATE POLICY "Videos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'videos');

CREATE POLICY "Authenticated users can upload videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);