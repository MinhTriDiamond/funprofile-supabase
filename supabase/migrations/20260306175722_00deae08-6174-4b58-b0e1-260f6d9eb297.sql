CREATE OR REPLACE FUNCTION public.sync_reward_status_on_ban()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.is_banned = true AND OLD.is_banned IS DISTINCT FROM NEW.is_banned THEN
    NEW.reward_status := 'banned';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_reward_on_ban
BEFORE UPDATE ON profiles
FOR EACH ROW
WHEN (OLD.is_banned IS DISTINCT FROM NEW.is_banned)
EXECUTE FUNCTION public.sync_reward_status_on_ban();