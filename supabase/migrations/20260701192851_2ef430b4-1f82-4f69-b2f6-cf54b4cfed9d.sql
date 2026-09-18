ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ;
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.enforce_archive_failure_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_status TEXT := NEW.archive_status;
  old_status TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.archive_status ELSE NULL END;
  is_transition BOOLEAN := new_status = 'failed'
    AND (TG_OP = 'INSERT' OR old_status IS DISTINCT FROM 'failed');
BEGIN
  IF new_status = 'failed' THEN
    IF NEW.archive_error IS NULL OR btrim(NEW.archive_error) = '' THEN
      NEW.archive_error := COALESCE(
        NULLIF(btrim(NEW.error_message), ''),
        'unknown_failure_no_context'
      );
    END IF;
    IF is_transition OR NEW.last_failed_at IS NULL THEN
      NEW.last_failed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_archive_failure_context ON public.live_replays;
CREATE TRIGGER trg_enforce_archive_failure_context
  BEFORE INSERT OR UPDATE OF archive_status, archive_error, error_message
  ON public.live_replays
  FOR EACH ROW EXECUTE FUNCTION public.enforce_archive_failure_context();

DROP TRIGGER IF EXISTS trg_enforce_archive_failure_context ON public.live_sessions;
CREATE TRIGGER trg_enforce_archive_failure_context
  BEFORE INSERT OR UPDATE OF archive_status, archive_error
  ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_archive_failure_context();

UPDATE public.live_replays
SET
  archive_error = COALESCE(
    NULLIF(btrim(archive_error), ''),
    NULLIF(btrim(error_message), ''),
    'legacy_failed_no_context'
  ),
  last_failed_at = COALESCE(last_failed_at, updated_at, created_at, now())
WHERE archive_status = 'failed'
  AND (archive_error IS NULL OR btrim(archive_error) = '');

UPDATE public.live_sessions
SET
  archive_error = COALESCE(
    NULLIF(btrim(archive_error), ''),
    'legacy_failed_no_context'
  ),
  last_failed_at = COALESCE(last_failed_at, updated_at, created_at, now())
WHERE archive_status = 'failed'
  AND (archive_error IS NULL OR btrim(archive_error) = '');

CREATE INDEX IF NOT EXISTS idx_live_replays_failed_recent
  ON public.live_replays (last_failed_at DESC)
  WHERE archive_status = 'failed';
CREATE INDEX IF NOT EXISTS idx_live_sessions_failed_recent
  ON public.live_sessions (last_failed_at DESC)
  WHERE archive_status = 'failed';

COMMENT ON COLUMN public.live_replays.last_failed_at IS
  'Timestamp lan cuoi archive_status chuyen sang failed. NULL = chua tung fail (hoac legacy truoc migration).';
COMMENT ON COLUMN public.live_sessions.last_failed_at IS
  'Timestamp lan cuoi archive_status chuyen sang failed. NULL = chua tung fail (hoac legacy truoc migration).';