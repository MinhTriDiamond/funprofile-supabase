CREATE OR REPLACE FUNCTION public.posts_sanitize_system_columns_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := coalesce(nullif(current_setting('role', true), ''), session_user);
BEGIN
  -- Chỉ ép với request đến từ client (anon/authenticated).
  IF v_role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.is_reward_eligible  := false;
  NEW.moderation_status   := 'approved';
  NEW.content_hash        := NULL;
  NEW.pplp_pillar         := NULL;
  NEW.scored_at           := NULL;
  NEW.scored_content_hash := NULL;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_posts_sanitize_system_columns_on_insert ON public.posts;
CREATE TRIGGER trg_posts_sanitize_system_columns_on_insert
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_sanitize_system_columns_on_insert();