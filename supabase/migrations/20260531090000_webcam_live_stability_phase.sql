-- Webcam livestream production stability phase.
-- Keep legacy statuses accepted while adding the stricter webcam states used by
-- the Agora -> R2 archive-only replay pipeline.

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check
  CHECK (status = ANY (ARRAY[
    'idle','preparing','waiting_for_obs','source_connected','ready_to_go_live',
    'live','reconnecting','ending','recording_processing','recording_failed',
    'disconnect_grace','ended','processing_replay','archived','failed',
    'created','starting','recording','processing','processing_stream','stream_ready',
    'exporting_mp4','uploading_r2','verifying_r2','replay_posted','stream_deleted',
    'posted','archiving','replay_temp_ready','archiving_r2','r2_ready','stream_delete_pending'
  ]));

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_recording_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_recording_status_check
  CHECK (
    recording_status IS NULL OR recording_status = ANY (ARRAY[
      'idle','acquiring','starting','recording','started','stopping','stopped',
      'processing','ready','failed','error','skipped','missing_ids','missed'
    ])
  );

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_host_connection_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_host_connection_status_check
  CHECK (host_connection_status IN ('online', 'offline', 'unknown', 'reconnecting'));

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS recording_resource_id text,
  ADD COLUMN IF NOT EXISTS recording_sid text,
  ADD COLUMN IF NOT EXISTS recording_uid integer,
  ADD COLUMN IF NOT EXISTS recording_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_last_query_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_error text,
  ADD COLUMN IF NOT EXISTS cleanup_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cleanup_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_url text,
  ADD COLUMN IF NOT EXISTS temp_path text,
  ADD COLUMN IF NOT EXISTS archive_path text,
  ADD COLUMN IF NOT EXISTS last_agora_query_response jsonb,
  ADD COLUMN IF NOT EXISTS token_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_expires_in_seconds integer,
  ADD COLUMN IF NOT EXISTS last_host_disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_host_reconnected_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_sessions_agora_reconnect_scan
  ON public.live_sessions (mode, status, last_host_heartbeat_at, updated_at)
  WHERE mode = 'agora_webcam' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_agora_query_health
  ON public.live_sessions (mode, recording_status, recording_last_query_at)
  WHERE mode = 'agora_webcam' AND deleted_at IS NULL;
