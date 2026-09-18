-- Add columns to comments table for nested replies and media
ALTER TABLE public.comments 
ADD COLUMN parent_comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
ADD COLUMN image_url text,
ADD COLUMN video_url text;

-- Add comment_id to reactions table to support comment reactions
ALTER TABLE public.reactions
ADD COLUMN comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;

-- Update reactions table constraint to allow either post_id or comment_id
ALTER TABLE public.reactions 
DROP CONSTRAINT IF EXISTS reactions_post_id_fkey;

ALTER TABLE public.reactions
ALTER COLUMN post_id DROP NOT NULL;

-- Add check constraint to ensure either post_id or comment_id is set
ALTER TABLE public.reactions
ADD CONSTRAINT reactions_target_check CHECK (
  (post_id IS NOT NULL AND comment_id IS NULL) OR 
  (post_id IS NULL AND comment_id IS NOT NULL)
);

-- Create storage bucket for comment media
INSERT INTO storage.buckets (id, name, public)
VALUES ('comment-media', 'comment-media', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for comment media bucket
CREATE POLICY "Comment media are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'comment-media');

CREATE POLICY "Users can upload comment media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'comment-media' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own comment media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'comment-media' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Enable realtime for comments and reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;

-- Create function to clean up comment media files
CREATE OR REPLACE FUNCTION public.cleanup_comment_files()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete image if exists
  IF OLD.image_url IS NOT NULL THEN
    PERFORM delete_storage_object('comment-media', substring(OLD.image_url from 'comment-media/(.*)$'));
  END IF;
  
  -- Delete video if exists
  IF OLD.video_url IS NOT NULL THEN
    PERFORM delete_storage_object('comment-media', substring(OLD.video_url from 'comment-media/(.*)$'));
  END IF;
  
  RETURN OLD;
END;
$$;

-- Create trigger for cleanup
DROP TRIGGER IF EXISTS cleanup_comment_files_trigger ON public.comments;
CREATE TRIGGER cleanup_comment_files_trigger
BEFORE DELETE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_comment_files();

-- Create notification trigger for comment likes
CREATE OR REPLACE FUNCTION public.create_notification_on_comment_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  comment_owner_id UUID;
BEGIN
  -- Get the comment owner
  SELECT user_id INTO comment_owner_id
  FROM comments
  WHERE id = NEW.comment_id;
  
  -- Don't notify if user likes their own comment
  IF comment_owner_id IS NOT NULL AND comment_owner_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, actor_id, type)
    VALUES (comment_owner_id, NEW.user_id, 'comment_like');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for comment like notifications
DROP TRIGGER IF EXISTS comment_like_notification_trigger ON public.reactions;
CREATE TRIGGER comment_like_notification_trigger
AFTER INSERT ON public.reactions
FOR EACH ROW
WHEN (NEW.comment_id IS NOT NULL)
EXECUTE FUNCTION public.create_notification_on_comment_like();

-- Update RLS policies for reactions to include comment reactions
DROP POLICY IF EXISTS "Users can create reactions" ON public.reactions;
CREATE POLICY "Users can create reactions"
ON public.reactions FOR INSERT
WITH CHECK (auth.uid() = user_id);