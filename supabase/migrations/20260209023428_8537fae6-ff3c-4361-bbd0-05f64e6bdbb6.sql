-- Fix search_path for the new trigger functions
CREATE OR REPLACE FUNCTION create_friend_request_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (NEW.friend_id, NEW.user_id, 'friend_request');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION create_friend_accepted_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (NEW.user_id, NEW.friend_id, 'friend_accepted');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION create_friend_removed_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'accepted' THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (OLD.friend_id, OLD.user_id, 'friend_removed');
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;