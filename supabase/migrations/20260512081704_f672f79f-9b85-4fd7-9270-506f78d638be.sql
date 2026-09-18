
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_connection_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_input_status text,
  ADD COLUMN IF NOT EXISTS preview_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS reconnect_count integer NOT NULL DEFAULT 0;

UPDATE public.live_sessions
SET connected_at = COALESCE(connected_at, source_connected_at),
    disconnected_at = COALESCE(disconnected_at, last_disconnected_at),
    preview_url = COALESCE(preview_url, hls_url, playback_url),
    preview_ready = COALESCE(preview_ready, false) OR (
      COALESCE(source_connected, false)
      AND COALESCE(hls_url, playback_url) IS NOT NULL
    )
WHERE mode = 'rtmp_obs';

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_realtime_connection
  ON public.live_sessions (mode, connection_status, source_connected, preview_ready, updated_at)
  WHERE mode = 'rtmp_obs' AND deleted_at IS NULL;

ALTER TABLE public.live_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
END $$;
