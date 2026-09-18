-- 1) Reset các session agora_webcam đang kẹt để processor mới (batch + manifest gating) chạy lại sạch.
UPDATE public.live_sessions
SET archive_status = 'pending',
    archive_retry_count = 0,
    archive_next_retry_at = now(),
    archive_error = NULL,
    updated_at = now()
WHERE mode = 'agora_webcam'
  AND ended_at IS NOT NULL
  AND replay_url IS NULL
  AND r2_video_url IS NULL
  AND created_at > now() - interval '48 hours'
  AND (archive_status IS NULL OR archive_status IN ('failed','pending','archiving'));

-- 2) Cron mỗi 15 phút cho watchdog dọn R2 temp orphan (post replay đã publish, temp vẫn còn rác).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agora-webcam-temp-cleanup-every-15min') THEN
    PERFORM cron.schedule(
      'agora-webcam-temp-cleanup-every-15min',
      '*/15 * * * *',
      $cron$
      select net.http_post(
        url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-webcam-temp-cleanup',
        headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
        body:='{"source":"pg_cron","limit":20}'::jsonb
      );
      $cron$
    );
  END IF;
END $$;