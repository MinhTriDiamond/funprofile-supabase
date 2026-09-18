-- Function to delete files from storage
CREATE OR REPLACE FUNCTION public.delete_storage_object(bucket_name text, object_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = bucket_name
  AND name = object_path;
END;
$$;

-- Function to clean up post files when a post is deleted
CREATE OR REPLACE FUNCTION public.cleanup_post_files()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete image if exists
  IF OLD.image_url IS NOT NULL THEN
    PERFORM delete_storage_object('posts', substring(OLD.image_url from 'posts/(.*)$'));
  END IF;
  
  -- Delete video if exists
  IF OLD.video_url IS NOT NULL THEN
    PERFORM delete_storage_object('videos', substring(OLD.video_url from 'videos/(.*)$'));
  END IF;
  
  RETURN OLD;
END;
$$;

-- Function to clean up old profile files when updated or deleted
CREATE OR REPLACE FUNCTION public.cleanup_profile_files()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On DELETE, clean up both avatar and cover
  IF TG_OP = 'DELETE' THEN
    IF OLD.avatar_url IS NOT NULL THEN
      PERFORM delete_storage_object('avatars', substring(OLD.avatar_url from 'avatars/(.*)$'));
    END IF;
    
    IF OLD.cover_url IS NOT NULL THEN
      PERFORM delete_storage_object('avatars', substring(OLD.cover_url from 'avatars/(.*)$'));
    END IF;
    
    RETURN OLD;
  END IF;
  
  -- On UPDATE, clean up old files if they changed
  IF TG_OP = 'UPDATE' THEN
    IF OLD.avatar_url IS NOT NULL AND OLD.avatar_url != COALESCE(NEW.avatar_url, '') THEN
      PERFORM delete_storage_object('avatars', substring(OLD.avatar_url from 'avatars/(.*)$'));
    END IF;
    
    IF OLD.cover_url IS NOT NULL AND OLD.cover_url != COALESCE(NEW.cover_url, '') THEN
      PERFORM delete_storage_object('avatars', substring(OLD.cover_url from 'avatars/(.*)$'));
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Trigger to clean up post files on delete
DROP TRIGGER IF EXISTS cleanup_post_files_trigger ON public.posts;
CREATE TRIGGER cleanup_post_files_trigger
BEFORE DELETE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_post_files();

-- Trigger to clean up profile files on update or delete
DROP TRIGGER IF EXISTS cleanup_profile_files_trigger ON public.profiles;
CREATE TRIGGER cleanup_profile_files_trigger
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_profile_files();