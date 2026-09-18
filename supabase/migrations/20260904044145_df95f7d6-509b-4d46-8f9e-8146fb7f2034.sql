CREATE OR REPLACE FUNCTION public.create_friend_removed_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'accepted'
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.friend_id)
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.user_id)
  THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (OLD.friend_id, OLD.user_id, 'friend_removed');
  END IF;
  RETURN OLD;
END;
$$;