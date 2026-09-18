-- Phase 6B — FUN Profile Activity Publisher (dry-run / flags OFF by default)
-- Slug: fun-profile  (KHÔNG dùng fun_profile)

-- 1) Mở rộng CHECK constraint event_type
ALTER TABLE public.fun_profile_event_outbox
  DROP CONSTRAINT IF EXISTS fun_profile_event_outbox_event_type_check;

ALTER TABLE public.fun_profile_event_outbox
  ADD CONSTRAINT fun_profile_event_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'PLATFORM_USER_CREATED',
    'PROFILE_UPDATED',
    'DID_PROMOTED',
    'TRUST_UPDATED',
    'SBT_ISSUED',
    'SBT_REVOKED',
    'WALLET_LINKED',
    'WALLET_UNLINKED',
    'FUN_PROFILE_POST_CREATED',
    'FUN_PROFILE_POST_UPDATED',
    'FUN_PROFILE_POST_DELETED',
    'FUN_PROFILE_POST_LIKED',
    'FUN_PROFILE_POST_SHARED',
    'FUN_PROFILE_COMMENT_CREATED',
    'FUN_PROFILE_COMMENT_LIKED',
    'FUN_PROFILE_LIVESTREAM_STARTED',
    'FUN_PROFILE_LIVESTREAM_COMPLETED',
    'FUN_PROFILE_LIVESTREAM_ATTENDED',
    'FUN_PROFILE_FOLLOWED_USER',
    'FUN_PROFILE_PROFILE_COMPLETED',
    'FUN_PROFILE_DAILY_ACTIVE'
  ]));

-- 2) Per-event flags — TẤT CẢ OFF cho tới khi FUN Core 6A ready
UPDATE public.app_settings
SET value = (value || jsonb_build_object(
    'FUN_PROFILE_POST_CREATED', false,
    'FUN_PROFILE_POST_UPDATED', false,
    'FUN_PROFILE_POST_DELETED', false,
    'FUN_PROFILE_POST_LIKED', false,
    'FUN_PROFILE_POST_SHARED', false,
    'FUN_PROFILE_COMMENT_CREATED', false,
    'FUN_PROFILE_COMMENT_LIKED', false,
    'FUN_PROFILE_LIVESTREAM_STARTED', false,
    'FUN_PROFILE_LIVESTREAM_COMPLETED', false,
    'FUN_PROFILE_LIVESTREAM_ATTENDED', false,
    'FUN_PROFILE_FOLLOWED_USER', false,
    'FUN_PROFILE_PROFILE_COMPLETED', false,
    'FUN_PROFILE_DAILY_ACTIVE', false
  ))
WHERE key = 'federation_outbox_event_flags';

-- 3) Helper an toàn: emit activity event + DAILY_ACTIVE piggy-back
CREATE OR REPLACE FUNCTION public._emit_fp_activity(
  p_event_type text,
  p_subject_user uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_daily_idem text;
  v_daily_payload jsonb;
BEGIN
  IF p_subject_user IS NULL THEN RETURN; END IF;

  v_payload := COALESCE(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'platform_slug', 'fun-profile',
      'origin_platform', 'fun-profile',
      'platform_user_id', p_subject_user::text
    );

  BEGIN
    PERFORM public._emit_fp_event(p_event_type, p_subject_user::text, v_payload, false);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF p_event_type NOT IN (
    'FUN_PROFILE_POST_DELETED',
    'FUN_PROFILE_DAILY_ACTIVE',
    'FUN_PROFILE_PROFILE_COMPLETED'
  ) THEN
    v_daily_idem := 'fun-profile:FUN_PROFILE_DAILY_ACTIVE:' || p_subject_user::text || ':' ||
                    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
    v_daily_payload := jsonb_build_object(
      'platform_slug', 'fun-profile',
      'origin_platform', 'fun-profile',
      'platform_user_id', p_subject_user::text,
      'date', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    );
    BEGIN
      INSERT INTO public.fun_profile_event_outbox(
        event_type, aggregate_type, aggregate_id, payload,
        status, attempts, trace_id, idempotency_key, next_attempt_at
      )
      SELECT 'FUN_PROFILE_DAILY_ACTIVE', 'platform_user', p_subject_user::text,
             v_daily_payload, 'pending', 0,
             'fp-' || replace(gen_random_uuid()::text, '-', ''),
             v_daily_idem, now()
      WHERE COALESCE(
        (SELECT (value)::boolean FROM public.app_settings WHERE key = 'federation_outbox_producer_enabled'),
        false
      ) = true
        AND COALESCE(
          (SELECT (value -> 'FUN_PROFILE_DAILY_ACTIVE')::boolean
             FROM public.app_settings WHERE key = 'federation_outbox_event_flags'),
          false
        ) = true
      ON CONFLICT (idempotency_key) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._emit_fp_activity(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._emit_fp_activity(text, uuid, jsonb) TO service_role;

-- 4) Trigger: posts → POST_CREATED / POST_UPDATED / POST_DELETED
CREATE OR REPLACE FUNCTION public.trg_emit_post_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_media boolean;
  v_char_len int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
    v_has_media := (NEW.image_url IS NOT NULL)
                OR (NEW.video_url IS NOT NULL)
                OR (NEW.media_urls IS NOT NULL AND jsonb_typeof(NEW.media_urls) = 'array' AND jsonb_array_length(NEW.media_urls) > 0);
    v_char_len := COALESCE(length(NEW.content), 0);
    PERFORM public._emit_fp_activity(
      'FUN_PROFILE_POST_CREATED',
      NEW.user_id,
      jsonb_build_object('post_id', NEW.id, 'has_media', v_has_media, 'char_len', v_char_len)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.content IS DISTINCT FROM OLD.content
       OR NEW.image_url IS DISTINCT FROM OLD.image_url
       OR NEW.video_url IS DISTINCT FROM OLD.video_url
       OR NEW.media_urls IS DISTINCT FROM OLD.media_urls THEN
      PERFORM public._emit_fp_activity(
        'FUN_PROFILE_POST_UPDATED', NEW.user_id,
        jsonb_build_object('post_id', NEW.id)
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS NULL THEN RETURN OLD; END IF;
    PERFORM public._emit_fp_activity(
      'FUN_PROFILE_POST_DELETED', OLD.user_id,
      jsonb_build_object('post_id', OLD.id)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_post_activity ON public.posts;
CREATE TRIGGER trg_outbox_post_activity
AFTER INSERT OR UPDATE OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_post_activity();

-- 5) Trigger: reactions → POST_LIKED
CREATE OR REPLACE FUNCTION public.trg_emit_reaction_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author uuid;
BEGIN
  IF NEW.user_id IS NULL OR NEW.post_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO v_author FROM public.posts WHERE id = NEW.post_id LIMIT 1;
  IF v_author IS NOT NULL AND v_author = NEW.user_id THEN RETURN NEW; END IF;
  PERFORM public._emit_fp_activity(
    'FUN_PROFILE_POST_LIKED', NEW.user_id,
    jsonb_build_object('post_id', NEW.post_id, 'author_id', v_author)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_reaction_activity ON public.reactions;
CREATE TRIGGER trg_outbox_reaction_activity
AFTER INSERT ON public.reactions
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_reaction_activity();

-- 6) Trigger: shared_posts → POST_SHARED
CREATE OR REPLACE FUNCTION public.trg_emit_share_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author uuid;
BEGIN
  IF NEW.user_id IS NULL OR NEW.original_post_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO v_author FROM public.posts WHERE id = NEW.original_post_id LIMIT 1;
  PERFORM public._emit_fp_activity(
    'FUN_PROFILE_POST_SHARED', NEW.user_id,
    jsonb_build_object('post_id', NEW.original_post_id, 'author_id', v_author)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_share_activity ON public.shared_posts;
CREATE TRIGGER trg_outbox_share_activity
AFTER INSERT ON public.shared_posts
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_share_activity();

-- 7) Trigger: comments → COMMENT_CREATED
CREATE OR REPLACE FUNCTION public.trg_emit_comment_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author uuid;
BEGIN
  IF NEW.user_id IS NULL OR NEW.post_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO v_author FROM public.posts WHERE id = NEW.post_id LIMIT 1;
  PERFORM public._emit_fp_activity(
    'FUN_PROFILE_COMMENT_CREATED', NEW.user_id,
    jsonb_build_object(
      'post_id', NEW.post_id,
      'comment_id', NEW.id,
      'author_id', v_author,
      'has_media', (NEW.image_url IS NOT NULL OR NEW.video_url IS NOT NULL)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_comment_activity ON public.comments;
CREATE TRIGGER trg_outbox_comment_activity
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_comment_activity();

-- 8) Trigger: friendships → FOLLOWED_USER
CREATE OR REPLACE FUNCTION public.trg_emit_follow_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL OR NEW.friend_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.user_id = NEW.friend_id THEN RETURN NEW; END IF;
  PERFORM public._emit_fp_activity(
    'FUN_PROFILE_FOLLOWED_USER', NEW.user_id,
    jsonb_build_object('target_user_id', NEW.friend_id, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_follow_activity ON public.friendships;
CREATE TRIGGER trg_outbox_follow_activity
AFTER INSERT ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_follow_activity();

-- 9) Trigger: live_sessions → LIVESTREAM_STARTED / COMPLETED
CREATE OR REPLACE FUNCTION public.trg_emit_live_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
  v_duration int;
BEGIN
  v_host := COALESCE(NEW.host_user_id, NEW.owner_id, NEW.user_id);
  IF v_host IS NULL THEN RETURN NEW; END IF;

  IF (TG_OP = 'INSERT' AND NEW.status = 'live')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'live' AND COALESCE(OLD.status,'') <> 'live') THEN
    PERFORM public._emit_fp_activity(
      'FUN_PROFILE_LIVESTREAM_STARTED', v_host,
      jsonb_build_object('session_id', NEW.id, 'started_at', NEW.started_at)
    );
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('ended','completed')
     AND COALESCE(OLD.status,'') NOT IN ('ended','completed') THEN
    v_duration := CASE
      WHEN NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL
        THEN GREATEST(0, EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::int)
      ELSE NULL
    END;
    PERFORM public._emit_fp_activity(
      'FUN_PROFILE_LIVESTREAM_COMPLETED', v_host,
      jsonb_build_object('session_id', NEW.id, 'duration_sec', v_duration, 'viewers_peak', NEW.viewer_count)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_live_activity ON public.live_sessions;
CREATE TRIGGER trg_outbox_live_activity
AFTER INSERT OR UPDATE ON public.live_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_live_activity();

-- 10) Trigger: profiles → PROFILE_COMPLETED (one-shot)
CREATE OR REPLACE FUNCTION public.trg_emit_profile_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_complete boolean;
  v_was_complete boolean;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.id IS NULL THEN RETURN NEW; END IF;

  v_now_complete :=
    NEW.display_name IS NOT NULL AND length(trim(NEW.display_name)) > 0
    AND NEW.avatar_url IS NOT NULL AND length(trim(NEW.avatar_url)) > 0
    AND NEW.bio        IS NOT NULL AND length(trim(NEW.bio)) > 0;

  v_was_complete :=
    OLD.display_name IS NOT NULL AND length(trim(COALESCE(OLD.display_name,''))) > 0
    AND OLD.avatar_url IS NOT NULL AND length(trim(COALESCE(OLD.avatar_url,''))) > 0
    AND OLD.bio        IS NOT NULL AND length(trim(COALESCE(OLD.bio,''))) > 0;

  IF v_now_complete AND NOT v_was_complete THEN
    PERFORM public._emit_fp_activity(
      'FUN_PROFILE_PROFILE_COMPLETED', NEW.id,
      jsonb_build_object('fields_completed', jsonb_build_array('display_name','avatar_url','bio'))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_profile_completed ON public.profiles;
CREATE TRIGGER trg_outbox_profile_completed
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_profile_completed();

COMMENT ON FUNCTION public._emit_fp_activity(text, uuid, jsonb) IS
  'Phase 6B activity emitter. Slug fun-profile. Mặc định OFF cho tới khi FUN Core 6A ready.';