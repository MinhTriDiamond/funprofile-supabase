ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS live_input_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_input_disable_error text;