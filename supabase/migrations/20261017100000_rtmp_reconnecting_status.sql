-- The RTMP status poller persists reconnecting before the grace deadline.
-- Preserve the installed status allowlist and add this missing lifecycle state.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  installed_expression text;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO STRICT installed_expression
  FROM pg_constraint
  WHERE conrelid = 'public.live_sessions'::regclass
    AND conname = 'live_sessions_status_check'
    AND contype = 'c';

  ALTER TABLE public.live_sessions DROP CONSTRAINT live_sessions_status_check;
  EXECUTE format(
    'ALTER TABLE public.live_sessions ADD CONSTRAINT live_sessions_status_check CHECK ((%s) OR status = %L) NOT VALID',
    installed_expression,
    'reconnecting'
  );
END;
$$;

ALTER TABLE public.live_sessions VALIDATE CONSTRAINT live_sessions_status_check;

-- Reconnecting is active: terminal sessions must not be reopened through it.
CREATE OR REPLACE FUNCTION public.live_sessions_state_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
      RAISE EXCEPTION 'invalid_transition: archived -> %', NEW.status;
    END IF;
    IF OLD.status IN ('ended','processing_replay','archived','posted','replay_posted')
       AND NEW.status IN ('live','source_connected','ready_to_go_live','waiting_for_obs','disconnect_grace','reconnecting','preparing','idle') THEN
      RAISE EXCEPTION 'invalid_transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
