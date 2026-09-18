-- Fix critical security issue: Remove permissive notification INSERT policy
-- and implement automatic notification creation via triggers

-- 1. Drop the insecure policy that allows anyone to create notifications
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- 2. Create a new restrictive policy (backup - triggers will handle creation)
CREATE POLICY "System generated notifications only"
ON public.notifications FOR INSERT
WITH CHECK (false); -- Block direct inserts, only triggers can create

-- 3. Create trigger function for like notifications
CREATE OR REPLACE FUNCTION public.create_notification_on_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_owner_id UUID;
BEGIN
  -- Get the post owner
  SELECT user_id INTO post_owner_id
  FROM posts
  WHERE id = NEW.post_id;
  
  -- Don't notify if user likes their own post
  IF post_owner_id IS NOT NULL AND post_owner_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, actor_id, post_id, type)
    VALUES (post_owner_id, NEW.user_id, NEW.post_id, 'like');
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4. Create trigger for like notifications
DROP TRIGGER IF EXISTS notify_on_like ON reactions;
CREATE TRIGGER notify_on_like
AFTER INSERT ON reactions
FOR EACH ROW EXECUTE FUNCTION create_notification_on_like();

-- 5. Create trigger function for comment notifications
CREATE OR REPLACE FUNCTION public.create_notification_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_owner_id UUID;
BEGIN
  -- Get the post owner
  SELECT user_id INTO post_owner_id
  FROM posts
  WHERE id = NEW.post_id;
  
  -- Don't notify if user comments on their own post
  IF post_owner_id IS NOT NULL AND post_owner_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, actor_id, post_id, type)
    VALUES (post_owner_id, NEW.user_id, NEW.post_id, 'comment');
  END IF;
  
  RETURN NEW;
END;
$$;

-- 6. Create trigger for comment notifications
DROP TRIGGER IF EXISTS notify_on_comment ON comments;
CREATE TRIGGER notify_on_comment
AFTER INSERT ON comments
FOR EACH ROW EXECUTE FUNCTION create_notification_on_comment();