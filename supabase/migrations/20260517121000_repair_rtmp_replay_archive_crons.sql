-- Keep RTMP replay archival moving: one archive cron + one MP4 poll cron.
-- Cloudflare Stream is temporary storage; R2 is final storage.

DO $$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN (
      'live-replay-archive-every-1min',
      'live-replay-archive-every-2min',
      'rtmp-live-watchdog-every-1min',
      'live-replay-mp4-poll-every-1min'
    )
    OR jobname LIKE 'live-replay-mp4-poll%'
  LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;
END $$;

SELECT cron.schedule(
  'live-replay-archive-every-1min',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-replay-archive-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"limit":8,"cleanup_limit":10}'::jsonb
  );
  $$
);

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

-- If an RTMP session has already ended but still carries status='live', it
-- must not block replay archival.
UPDATE public.live_sessions ls
SET status = 'replay_temp_ready',
    archive_status = COALESCE(ls.archive_status, 'pending'),
    archive_error = NULL,
    source_connected = false,
    is_input_armed = false,
    updated_at = now()
WHERE ls.mode = 'rtmp_obs'
  AND ls.status = 'live'
  AND ls.ended_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.live_replays lr
    WHERE lr.live_session_id = ls.id
      AND lr.status = 'ready'
      AND lr.r2_video_url IS NULL
      AND COALESCE(lr.stream_uid, lr.cloudflare_video_uid) IS NOT NULL
  );

-- Repair RTMP replays that are ready on Cloudflare Stream but have not yet
-- reached R2. This does not delete any Cloudflare Stream video.
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
  AND COALESCE(lr.stream_uid, lr.cloudflare_video_uid) IS NOT NULL
  AND lr.r2_video_url IS NULL
  AND (
    lr.archive_status IS NULL
    OR lr.archive_status IN ('pending','failed','archiving','processing_stream','stream_ready','exporting_mp4','uploading_r2','verifying_r2')
    OR lr.archive_phase IN ('mp4_export','mp4_wait','multipart_init','multipart_upload','verifying','posting','deleting_stream')
  );
