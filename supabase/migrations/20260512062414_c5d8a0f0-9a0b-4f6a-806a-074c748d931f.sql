ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS source_connected boolean NOT NULL DEFAULT false;

UPDATE public.live_sessions
SET
  source_connected = (source_connected_at IS NOT NULL AND status IN ('source_connected','ready_to_go_live','live')),
  connection_status = CASE
    WHEN status = 'live' THEN 'connected'
    WHEN status = 'disconnect_grace' THEN 'disconnected'
    WHEN source_connected_at IS NOT NULL AND status IN ('source_connected','ready_to_go_live') THEN 'connected'
    ELSE 'waiting'
  END
WHERE mode = 'rtmp_obs';

CREATE INDEX IF NOT EXISTS idx_live_sessions_connection_status
  ON public.live_sessions(connection_status)
  WHERE deleted_at IS NULL;