-- RTMP OBS signal reconnect timeout state.
-- Adds explicit signal tracking so the producer can show reconnecting and auto-end cleanly.

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS signal_status text,
  ADD COLUMN IF NOT EXISTS signal_lost_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconnect_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_end_reason text;

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_signal_reconnect_deadline
  ON public.live_sessions (mode, status, reconnect_deadline_at)
  WHERE mode = 'rtmp_obs' AND ended_at IS NULL;

UPDATE public.live_sessions
SET
  signal_status = COALESCE(signal_status, CASE
    WHEN status = 'reconnecting' THEN 'lost'
    WHEN status = 'live' AND last_disconnected_at IS NOT NULL THEN 'lost'
    ELSE signal_status
  END),
  signal_lost_at = COALESCE(signal_lost_at, last_disconnected_at),
  reconnect_deadline_at = COALESCE(
    reconnect_deadline_at,
    CASE
      WHEN last_disconnected_at IS NOT NULL THEN last_disconnected_at + interval '60 seconds'
      ELSE NULL
    END
  ),
  auto_end_reason = COALESCE(auto_end_reason, CASE
    WHEN end_reason = 'obs_signal_lost_timeout' THEN 'obs_signal_lost_timeout'
    ELSE auto_end_reason
  END)
WHERE mode = 'rtmp_obs'
  AND (
    signal_status IS NULL
    OR signal_lost_at IS NULL
    OR reconnect_deadline_at IS NULL
    OR auto_end_reason IS NULL
  );
