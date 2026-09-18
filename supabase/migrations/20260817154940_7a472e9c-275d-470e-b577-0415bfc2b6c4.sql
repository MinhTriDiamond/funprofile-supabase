CREATE OR REPLACE FUNCTION public.posts_freeze_system_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := coalesce(nullif(current_setting('role', true), ''), session_user);
  v_is_admin boolean := false;
BEGIN
  -- SECURITY DEFINER làm current_user = owner, nên phải đọc role của request.
  IF v_role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL THEN
    v_is_admin := public.has_role(v_uid, 'admin'::app_role);
  END IF;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  NEW.is_reward_eligible := OLD.is_reward_eligible;
  NEW.moderation_status  := OLD.moderation_status;
  NEW.content_hash       := OLD.content_hash;
  NEW.pplp_pillar        := OLD.pplp_pillar;
  NEW.user_id            := OLD.user_id;

  RETURN NEW;
END;
$$;