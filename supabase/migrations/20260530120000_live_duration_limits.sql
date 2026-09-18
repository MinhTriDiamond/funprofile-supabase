-- Authoritative livestream duration limits watchdog.

CREATE INDEX IF NOT EXISTS idx_live_sessions_duration_watchdog
  ON public.live_sessions (mode, status, started_at)
  WHERE deleted_at IS NULL
    AND status IN (
      'live',
      'starting',
      'created',
      'recording',
      'processing',
      'processing_replay',
      'disconnect_grace',
      'source_connected',
      'ready_to_go_live'
    );

SELECT cron.unschedule('live-duration-watchdog-every-1min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-duration-watchdog-every-1min');

SELECT cron.schedule(
  'live-duration-watchdog-every-1min',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-duration-watchdog',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{"source":"pg_cron","limit":50}'::jsonb
  );
  $$
);
