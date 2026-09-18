ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS webhook_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_event text,
  ADD COLUMN IF NOT EXISTS last_cf_status text,
  ADD COLUMN IF NOT EXISTS last_cf_response jsonb,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_replays_webhook_received
  ON public.live_replays(webhook_received_at DESC)
  WHERE webhook_received_at IS NOT NULL;

-- Backfill: reset last_ingest_at cho mọi replay queued/uploading để cron tiêu thụ lại từ đầu hàng đợi
UPDATE public.live_replays
SET last_ingest_at = NULL
WHERE status IN ('queued','uploading');

-- Xoá cron watchdog đang gọi function không tồn tại
DO $$
DECLARE _jid bigint;
BEGIN
  SELECT jobid INTO _jid FROM cron.job WHERE jobname = 'live-replay-watchdog-every-15min';
  IF _jid IS NOT NULL THEN PERFORM cron.unschedule(_jid); END IF;
END $$;