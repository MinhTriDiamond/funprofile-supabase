
ALTER TABLE public.pplp_v2_events
  ADD COLUMN IF NOT EXISTS expected_duration_minutes INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS event_score NUMERIC DEFAULT 0;
