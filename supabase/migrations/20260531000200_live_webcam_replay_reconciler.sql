-- Reconcile ended Agora webcam sessions where R2 temp has HLS but feed/replay DB is stale.

CREATE INDEX IF NOT EXISTS idx_live_sessions_webcam_replay_reconcile
  ON public.live_sessions (mode, ended_at, archive_status, updated_at)
  WHERE mode = 'agora_webcam'
    AND deleted_at IS NULL
    AND ended_at IS NOT NULL;

SELECT cron.unschedule('agora-webcam-replay-reconciler-every-5min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agora-webcam-replay-reconciler-every-5min');

SELECT cron.schedule(
  'agora-webcam-replay-reconciler-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-webcam-replay-reconciler',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{"source":"pg_cron","limit":10}'::jsonb
  );
  $$
);
