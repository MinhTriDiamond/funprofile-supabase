-- Add media_urls column to store multiple media items as JSON array
-- Format: [{"url": "...", "type": "image|video"}, ...]
ALTER TABLE public.posts 
ADD COLUMN media_urls JSONB DEFAULT '[]'::jsonb;

-- Create index for better query performance
CREATE INDEX idx_posts_media_urls ON public.posts USING GIN (media_urls);