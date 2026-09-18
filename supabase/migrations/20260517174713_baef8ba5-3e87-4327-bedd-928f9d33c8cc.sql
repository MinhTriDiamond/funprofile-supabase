CREATE OR REPLACE FUNCTION public.live_replays_patch(p_id uuid, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r live_replays%ROWTYPE;
  merged live_replays%ROWTYPE;
BEGIN
  SELECT * INTO r FROM live_replays WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  merged := jsonb_populate_record(r, p_patch);
  UPDATE live_replays SET
    archive_phase                = merged.archive_phase,
    archive_status               = merged.archive_status,
    archive_attempts             = merged.archive_attempts,
    archive_lease_until          = merged.archive_lease_until,
    archive_next_retry_at        = merged.archive_next_retry_at,
    archive_error                = merged.archive_error,
    archived_at                  = merged.archived_at,
    last_error_at                = merged.last_error_at,
    error_message                = merged.error_message,
    multipart_upload_id          = merged.multipart_upload_id,
    multipart_parts_done         = merged.multipart_parts_done,
    multipart_bytes_done         = merged.multipart_bytes_done,
    multipart_total_parts        = merged.multipart_total_parts,
    multipart_part_size          = merged.multipart_part_size,
    mp4_export_started_at        = merged.mp4_export_started_at,
    mp4_ready_at                 = merged.mp4_ready_at,
    mp4_total_bytes              = merged.mp4_total_bytes,
    cloudflare_mp4_download_url  = merged.cloudflare_mp4_download_url,
    stream_deleted_at            = merged.stream_deleted_at,
    cloudflare_deleted_at        = merged.cloudflare_deleted_at,
    delete_stream_error          = merged.delete_stream_error,
    r2_object_key                = merged.r2_object_key,
    r2_bucket                    = merged.r2_bucket,
    r2_video_url                 = merged.r2_video_url,
    r2_verified_at               = merged.r2_verified_at,
    replay_post_id               = merged.replay_post_id,
    replay_ready_at              = merged.replay_ready_at,
    posted_at                    = merged.posted_at,
    auto_posted_at               = merged.auto_posted_at,
    duration_seconds             = merged.duration_seconds,
    deleted_at                   = merged.deleted_at,
    filesize_bytes               = merged.filesize_bytes,
    playback_mp4                 = merged.playback_mp4,
    playback_provider            = merged.playback_provider,
    storage_provider             = merged.storage_provider,
    status                       = merged.status,
    expires_at                   = merged.expires_at,
    last_cf_status               = merged.last_cf_status,
    last_cf_response             = merged.last_cf_response,
    updated_at                   = now()
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_replays_patch(uuid, jsonb) TO service_role;

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
    body:='{"limit":12,"cleanup_limit":10}'::jsonb
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
    body:='{"limit":40}'::jsonb
  );
  $$
);

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

UPDATE public.live_replays lr
SET archive_status = CASE
      WHEN lr.archive_status = 'unrecoverable' THEN 'pending'
      ELSE COALESCE(lr.archive_status, 'pending')
    END,
    archive_attempts = 0,
    archive_error = NULL,
    error_message = NULL,
    last_error_at = NULL,
    archive_lease_until = NULL,
    archive_next_retry_at = now(),
    last_cf_status = 'migration_repair_long_rtmp_archive',
    updated_at = now()
FROM public.live_sessions ls
WHERE lr.live_session_id = ls.id
  AND ls.mode = 'rtmp_obs'
  AND lr.cloudflare_vod_enabled = true
  AND lr.status = 'ready'
  AND COALESCE(lr.stream_uid, lr.cloudflare_video_uid) IS NOT NULL
  AND lr.r2_video_url IS NULL
  AND (
    lr.duration_seconds >= 3600
    OR lr.mp4_total_bytes >= 1073741824
    OR lr.archive_phase IN ('mp4_wait','multipart_init','multipart_upload','verifying','posting')
    OR lr.archive_status IN ('pending','failed','archiving','processing_stream','stream_ready','exporting_mp4','uploading_r2','verifying_r2')
    OR (
      lr.archive_status = 'unrecoverable'
      AND COALESCE(lr.archive_error, '') !~* '(404|not found|không còn|deleted)'
    )
  );