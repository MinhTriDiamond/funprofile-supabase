-- Schedule the Cloudflare Stream MP4 polling cron that advances replays from
-- archive_phase='mp4_wait' to multipart upload/R2 archival.

DO $$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname LIKE 'live-replay-mp4-poll%'
  LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;
END $$;

SELECT cron.schedule(
  'live-replay-mp4-poll-every-1min',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-replay-mp4-poll-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"limit":30}'::jsonb
  );
  $$
);

-- Backfill/repair old RTMP replays that Cloudflare already marked ready but
-- were blocked by missing MP4 polling or exhausted retry caps. This only resets
-- archive retry metadata; it does not delete any Cloudflare Stream video.
UPDATE public.live_replays lr
SET archive_status = COALESCE(lr.archive_status, 'pending'),
    archive_attempts = 0,
    archive_error = NULL,
    error_message = NULL,
    last_error_at = NULL,
    archive_lease_until = NULL,
    archive_next_retry_at = now(),
    updated_at = now()
FROM public.live_sessions ls
WHERE lr.live_session_id = ls.id
  AND ls.mode = 'rtmp_obs'
  AND lr.cloudflare_vod_enabled = true
  AND lr.status = 'ready'
  AND lr.stream_uid IS NOT NULL
  AND lr.r2_video_url IS NULL
  AND COALESCE(lr.archive_status, 'pending') IN (
    'pending',
    'failed',
    'exporting_mp4',
    'stream_ready',
    'uploading_r2',
    'verifying_r2'
  )
  AND COALESCE(lr.archive_attempts, 0) >= 8;
