-- Professional RTMP/OBS end-live lifecycle.
-- Adds manual end metadata, disconnect grace tracking, and Live Input disable state.

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check
  CHECK (status IN (
    'created',
    'waiting_for_obs',
    'source_connected',
    'ready_to_go_live',
    'disconnect_grace',
    'live',
    'ended',
    'processing',
    'archiving',
    'posted',
    'processing_stream',
    'stream_ready',
    'exporting_mp4',
    'uploading_r2',
    'verifying_r2',
    'archived',
    'replay_posted',
    'stream_deleted',
    'failed'
  ));

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS connection_status text,
  ADD COLUMN IF NOT EXISTS source_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS live_input_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_input_disable_error text,
  ADD COLUMN IF NOT EXISTS replay_post_id uuid,
  ADD COLUMN IF NOT EXISTS live_post_id uuid;

UPDATE public.live_sessions
SET source_connected = true,
    connection_status = COALESCE(connection_status, 'connected')
WHERE source_connected_at IS NOT NULL
  AND status IN ('source_connected', 'ready_to_go_live', 'live');

UPDATE public.live_sessions
SET connection_status = COALESCE(connection_status, 'ended')
WHERE status IN ('ended', 'processing_stream', 'stream_ready', 'exporting_mp4', 'uploading_r2', 'verifying_r2', 'archived', 'replay_posted', 'stream_deleted');

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_active_connection
  ON public.live_sessions (mode, status, connection_status, last_disconnected_at)
  WHERE mode = 'rtmp_obs' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_disconnect_grace
  ON public.live_sessions (last_disconnected_at)
  WHERE mode = 'rtmp_obs' AND status = 'disconnect_grace';

DROP POLICY IF EXISTS "public can read live sessions" ON public.live_sessions;
CREATE POLICY "public can read live sessions"
  ON public.live_sessions FOR SELECT
  TO anon, authenticated
  USING (status IN (
    'live',
    'disconnect_grace',
    'ended',
    'processing',
    'archiving',
    'posted',
    'processing_stream',
    'stream_ready',
    'exporting_mp4',
    'uploading_r2',
    'verifying_r2',
    'archived',
    'replay_posted',
    'stream_deleted'
  ));

SELECT cron.unschedule('live-replay-archive-every-2min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-replay-archive-every-2min');

SELECT cron.unschedule('rtmp-live-watchdog-every-1min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rtmp-live-watchdog-every-1min');

SELECT cron.schedule(
  'rtmp-live-watchdog-every-1min',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-replay-archive-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"limit":5}'::jsonb
  );
  $$
);
