-- Let long livestream VOD uploads continue across many cron ticks.
-- Older code stopped selecting queued/uploading replays after 30 attempts,
-- which is too low for long recordings uploaded through server-side TUS.

UPDATE public.live_replays
SET
  ingest_attempts = 0,
  last_ingest_at = NULL,
  error_message = NULL,
  last_error_at = NULL,
  last_cf_status = COALESCE(last_cf_status, 'long_upload_retry_unblocked')
WHERE status IN ('queued', 'uploading')
  AND ingest_attempts >= 30;
