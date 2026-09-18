
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS is_input_armed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS armed_at timestamptz,
  ADD COLUMN IF NOT EXISTS armed_session_token text,
  ADD COLUMN IF NOT EXISTS last_armed_heartbeat_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_sessions_input_armed
  ON public.live_sessions (cloudflare_live_input_id)
  WHERE is_input_armed = true;

UPDATE public.live_sessions
SET is_input_armed = true,
    armed_at = COALESCE(armed_at, now()),
    last_armed_heartbeat_at = COALESCE(last_armed_heartbeat_at, now())
WHERE mode = 'rtmp_obs'
  AND status IN ('waiting_for_obs','source_connected','ready_to_go_live','live','disconnect_grace')
  AND is_input_armed = false;
