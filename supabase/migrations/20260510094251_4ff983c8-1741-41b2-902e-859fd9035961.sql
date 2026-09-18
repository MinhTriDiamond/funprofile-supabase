ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_rtmp_stream_mode TEXT NOT NULL DEFAULT 'temporary';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_preferred_rtmp_stream_mode_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_preferred_rtmp_stream_mode_check
      CHECK (preferred_rtmp_stream_mode IN ('persistent','temporary'));
  END IF;
END$$;