-- 1. Add 'expired' to enum if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.live_replay_status'::regtype AND enumlabel = 'expired'
  ) THEN
    ALTER TYPE public.live_replay_status ADD VALUE 'expired';
  END IF;
END$$;

-- 2. Add columns
ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 3. Index for cron scan
CREATE INDEX IF NOT EXISTS idx_live_replays_expires_at
  ON public.live_replays (expires_at)
  WHERE deleted_at IS NULL;

-- 4. Backfill expires_at for current ready replays
UPDATE public.live_replays
SET expires_at = COALESCE(updated_at, created_at) + interval '30 days'
WHERE status = 'ready' AND expires_at IS NULL AND deleted_at IS NULL;

-- 5. Trigger: when status becomes 'ready', set expires_at = now() + 30 days
CREATE OR REPLACE FUNCTION public.set_live_replay_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ready'
     AND (OLD.status IS DISTINCT FROM 'ready')
     AND NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + interval '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_live_replay_expiry ON public.live_replays;
CREATE TRIGGER trg_set_live_replay_expiry
  BEFORE UPDATE ON public.live_replays
  FOR EACH ROW
  EXECUTE FUNCTION public.set_live_replay_expiry();