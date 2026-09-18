ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS recording_layout TEXT,
  ADD COLUMN IF NOT EXISTS recording_width INTEGER,
  ADD COLUMN IF NOT EXISTS recording_height INTEGER,
  ADD COLUMN IF NOT EXISTS recording_aspect_ratio TEXT,
  ADD COLUMN IF NOT EXISTS source_device_type TEXT;

CREATE INDEX IF NOT EXISTS idx_live_sessions_recording_layout
  ON public.live_sessions(recording_layout)
  WHERE mode = 'agora_webcam';