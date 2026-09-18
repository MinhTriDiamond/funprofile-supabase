ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_live boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_live_session_id uuid REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS live_started_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_is_live
  ON public.profiles (is_live)
  WHERE is_live = true;

CREATE INDEX IF NOT EXISTS idx_profiles_current_live_session_id
  ON public.profiles (current_live_session_id)
  WHERE current_live_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_active_by_host_visibility
  ON public.live_sessions (host_user_id, status, ended_at, started_at DESC)
  WHERE status IN ('live', 'reconnecting') AND ended_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_active_live_state(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_user_id');
  END IF;

  SELECT
    ls.id,
    ls.started_at
  INTO v_session
  FROM public.live_sessions ls
  WHERE COALESCE(ls.host_user_id, ls.owner_id, ls.user_id) = p_user_id
    AND ls.status IN ('live', 'reconnecting')
    AND ls.ended_at IS NULL
  ORDER BY COALESCE(ls.started_at, ls.created_at, ls.updated_at) DESC
  LIMIT 1;

  IF v_session.id IS NULL THEN
    UPDATE public.profiles
    SET
      is_live = false,
      current_live_session_id = NULL,
      live_started_at = NULL
    WHERE id = p_user_id
      AND (
        is_live = true
        OR current_live_session_id IS NOT NULL
        OR live_started_at IS NOT NULL
      );

    RETURN jsonb_build_object('ok', true, 'is_live', false);
  END IF;

  UPDATE public.profiles
  SET
    is_live = true,
    current_live_session_id = v_session.id,
    live_started_at = COALESCE(v_session.started_at, now())
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'is_live', true,
    'live_session_id', v_session.id,
    'live_started_at', COALESCE(v_session.started_at, now())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_active_live_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_active_live_state(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_all_active_live_states()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_user_id IN
    SELECT DISTINCT p.id
    FROM public.profiles p
    WHERE p.is_live = true OR p.current_live_session_id IS NOT NULL
    UNION
    SELECT DISTINCT COALESCE(ls.host_user_id, ls.owner_id, ls.user_id)
    FROM public.live_sessions ls
    WHERE ls.status IN ('live', 'reconnecting')
      AND ls.ended_at IS NULL
      AND COALESCE(ls.host_user_id, ls.owner_id, ls.user_id) IS NOT NULL
  LOOP
    PERFORM public.sync_active_live_state(v_user_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'repaired_users', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_all_active_live_states() TO service_role;

CREATE OR REPLACE FUNCTION public.handle_live_session_visibility_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.sync_active_live_state(COALESCE(NEW.host_user_id, NEW.owner_id, NEW.user_id));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.host_user_id, OLD.owner_id, OLD.user_id) IS DISTINCT FROM COALESCE(NEW.host_user_id, NEW.owner_id, NEW.user_id) THEN
      PERFORM public.sync_active_live_state(COALESCE(OLD.host_user_id, OLD.owner_id, OLD.user_id));
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status
      OR OLD.ended_at IS DISTINCT FROM NEW.ended_at
      OR OLD.started_at IS DISTINCT FROM NEW.started_at
      OR OLD.host_user_id IS DISTINCT FROM NEW.host_user_id
      OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
      OR OLD.user_id IS DISTINCT FROM NEW.user_id
    THEN
      PERFORM public.sync_active_live_state(COALESCE(NEW.host_user_id, NEW.owner_id, NEW.user_id));
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_active_live_state(COALESCE(OLD.host_user_id, OLD.owner_id, OLD.user_id));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_session_visibility_sync ON public.live_sessions;
CREATE TRIGGER trg_live_session_visibility_sync
AFTER INSERT OR UPDATE OF status, ended_at, started_at, host_user_id, owner_id, user_id OR DELETE
ON public.live_sessions
FOR EACH ROW
EXECUTE FUNCTION public.handle_live_session_visibility_sync();

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  username,
  username_normalized,
  avatar_url,
  bio,
  cover_url,
  created_at,
  full_name,
  display_name,
  social_links,
  public_wallet_address,
  is_banned,
  location,
  workplace,
  education,
  relationship_status,
  btc_address,
  is_live,
  current_live_session_id,
  live_started_at
FROM public.profiles p;

GRANT SELECT ON public.public_profiles TO anon;
GRANT SELECT ON public.public_profiles TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'sync-active-live-state-every-5min';

    PERFORM cron.schedule(
      'sync-active-live-state-every-5min',
      '*/5 * * * *',
      'SELECT public.sync_all_active_live_states();'
    );
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    NULL;
  WHEN insufficient_privilege THEN
    NULL;
END $$;

SELECT public.sync_all_active_live_states();