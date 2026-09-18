-- RTMP replay archive cleanup watchdog.
-- Ensures R2-ready replays can be rendered as live_replay posts and Cloudflare Stream leftovers are retried.

CREATE INDEX IF NOT EXISTS idx_live_replays_archived_stream_cleanup_watchdog
  ON public.live_replays (archive_status, playback_provider, storage_provider, updated_at)
  WHERE cloudflare_video_uid IS NOT NULL
    AND r2_object_key IS NOT NULL
    AND r2_video_url IS NOT NULL
    AND (stream_deleted_at IS NULL OR cloudflare_deleted_at IS NULL OR delete_stream_error IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_posts_live_replay_ready
  ON public.posts (post_type, replay_status, replay_ready, updated_at)
  WHERE post_type IN ('live', 'live_replay');

SELECT cron.unschedule('rtmp-replay-archive-cleanup-every-5min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rtmp-replay-archive-cleanup-every-5min');

SELECT cron.schedule(
  'rtmp-replay-archive-cleanup-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-replay-archive-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"limit":5,"cleanup_limit":25}'::jsonb
  );
  $$
);
