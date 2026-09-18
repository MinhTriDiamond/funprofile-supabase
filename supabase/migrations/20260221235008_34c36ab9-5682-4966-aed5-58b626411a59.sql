
-- Drop broken triggers (correct names)
DROP TRIGGER IF EXISTS cleanup_post_files_trigger ON public.posts;
DROP TRIGGER IF EXISTS cleanup_post_files ON public.posts;
DROP TRIGGER IF EXISTS cleanup_comment_files_trigger ON public.comments;
DROP TRIGGER IF EXISTS cleanup_comment_files ON public.comments;

-- Drop functions with CASCADE to handle any remaining dependencies
DROP FUNCTION IF EXISTS public.cleanup_post_files() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_comment_files() CASCADE;
DROP FUNCTION IF EXISTS public.delete_storage_object(text, text) CASCADE;
