
-- 1. Gỡ trigger tự set expires_at = now() + 30d
DROP TRIGGER IF EXISTS trg_set_live_replay_expiry ON public.live_replays;

-- 2. Clear expires_at và expiry_notified_at cho mọi replay còn sống
UPDATE public.live_replays
SET expires_at = NULL,
    expiry_notified_at = NULL
WHERE deleted_at IS NULL;

-- 3. Hủy cron job hourly
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-replay-expiry-hourly') THEN
    PERFORM cron.unschedule('live-replay-expiry-hourly');
  END IF;
END $$;
