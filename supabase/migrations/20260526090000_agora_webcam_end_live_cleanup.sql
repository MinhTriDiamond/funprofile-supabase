-- Backend-driven Agora webcam end-live cleanup.

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check
  CHECK (status = ANY (ARRAY[
    'idle','preparing','waiting_for_obs','source_connected','ready_to_go_live',
    'live','ending','disconnect_grace','ended','processing_replay','archived','failed',
    'created','starting','recording','processing','processing_stream','stream_ready',
    'exporting_mp4','uploading_r2','verifying_r2','replay_posted','stream_deleted',
    'posted','archiving','replay_temp_ready','archiving_r2','r2_ready','stream_delete_pending'
  ]));

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS last_host_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS host_connection_status text NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS recording_stop_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_last_query_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cleanup_at timestamptz;

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_host_connection_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_host_connection_status_check
  CHECK (host_connection_status IN ('online', 'offline', 'unknown'));

UPDATE public.live_sessions
SET
  host_connection_status = CASE WHEN status = 'live' THEN 'online' ELSE 'offline' END,
  last_host_heartbeat_at = COALESCE(last_host_heartbeat_at, updated_at),
  last_seen_at = COALESCE(last_seen_at, updated_at)
WHERE mode = 'agora_webcam';

CREATE INDEX IF NOT EXISTS idx_live_sessions_agora_zombie_scan
  ON public.live_sessions (mode, status, last_host_heartbeat_at, recording_status, updated_at)
  WHERE mode = 'agora_webcam' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_recording_cleanup
  ON public.live_sessions (recording_status, recording_stop_requested_at, recording_stopped_at)
  WHERE mode = 'agora_webcam' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_session_events_reason_created
  ON public.live_session_events(reason, created_at DESC);

SELECT cron.unschedule('agora-webcam-zombie-cleanup-every-1min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agora-webcam-zombie-cleanup-every-1min');

SELECT cron.schedule(
  'agora-webcam-zombie-cleanup-every-1min',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-zombie-cleanup',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{"source":"pg_cron"}'::jsonb
  );
  $$
);
