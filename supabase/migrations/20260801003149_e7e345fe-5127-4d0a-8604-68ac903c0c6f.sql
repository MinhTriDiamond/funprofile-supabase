ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS auto_end_reason text,
  ADD COLUMN IF NOT EXISTS signal_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS signal_lost_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconnect_deadline_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_sessions_signal_status
  ON public.live_sessions (signal_status)
  WHERE signal_status IS NOT NULL AND signal_status <> 'ok';