-- Cloudflare Stream production replay pipeline for livestream VODs.

DO $$
BEGIN
  CREATE TYPE public.live_replay_status AS ENUM (
    'uploading',
    'queued',
    'processing',
    'ready',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.live_replays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  live_session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  chunked_recording_id UUID REFERENCES public.chunked_recordings(id) ON DELETE SET NULL,
  source_webm_key TEXT,
  stream_uid TEXT UNIQUE,
  playback_hls TEXT,
  playback_dash TEXT,
  playback_mp4 TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  filesize_bytes BIGINT,
  status public.live_replay_status NOT NULL DEFAULT 'uploading',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_replays_user_created
  ON public.live_replays(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_replays_live_session
  ON public.live_replays(live_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_replays_chunked_recording
  ON public.live_replays(chunked_recording_id);
CREATE INDEX IF NOT EXISTS idx_live_replays_status
  ON public.live_replays(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_replays_stream_uid
  ON public.live_replays(stream_uid)
  WHERE stream_uid IS NOT NULL;

DROP TRIGGER IF EXISTS update_live_replays_updated_at ON public.live_replays;
CREATE TRIGGER update_live_replays_updated_at
BEFORE UPDATE ON public.live_replays
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.live_replays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own live replays" ON public.live_replays;
CREATE POLICY "Users can view own live replays"
  ON public.live_replays FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can view ready live replays" ON public.live_replays;
CREATE POLICY "Public can view ready live replays"
  ON public.live_replays FOR SELECT
  TO anon, authenticated
  USING (status = 'ready');

DROP POLICY IF EXISTS "Users can update own uploading live replays" ON public.live_replays;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_replays;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
