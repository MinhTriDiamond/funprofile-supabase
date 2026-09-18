-- Update the create_notification_on_like function to save the actual reaction type
CREATE OR REPLACE FUNCTION public.create_notification_on_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    -- Check for existing notification to avoid spam
    -- If same user reacted to same post recently (within 1 hour), update instead of create
    UPDATE notifications 
    SET type = NEW.type, created_at = now(), read = false
    WHERE user_id = post_owner_id 
      AND actor_id = NEW.user_id 
      AND post_id = NEW.post_id 
      AND type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')
      AND created_at > now() - interval '1 hour';
    
    -- If no existing notification was updated, create a new one
    IF NOT FOUND THEN
      INSERT INTO notifications (user_id, actor_id, post_id, type)
      VALUES (post_owner_id, NEW.user_id, NEW.post_id, NEW.type);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;