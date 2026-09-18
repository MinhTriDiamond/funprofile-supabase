
DO $$ BEGIN
  CREATE TYPE public.live_replay_status AS ENUM ('uploading','queued','processing','ready','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.live_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  live_session_id uuid NOT NULL,
  chunked_recording_id uuid,
  source_webm_key text,
  stream_uid text,
  playback_hls text,
  playback_dash text,
  playback_mp4 text,
  thumbnail_url text,
  duration_seconds integer,
  filesize_bytes bigint,
  status public.live_replay_status NOT NULL DEFAULT 'uploading',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_replays_stream_uid ON public.live_replays(stream_uid);
CREATE INDEX IF NOT EXISTS idx_live_replays_session ON public.live_replays(live_session_id);
CREATE INDEX IF NOT EXISTS idx_live_replays_user ON public.live_replays(user_id);
CREATE INDEX IF NOT EXISTS idx_live_replays_recording ON public.live_replays(chunked_recording_id);

ALTER TABLE public.live_replays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view own replays" ON public.live_replays;
CREATE POLICY "Owner can view own replays"
  ON public.live_replays FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated can view public session replays" ON public.live_replays;
CREATE POLICY "Authenticated can view public session replays"
  ON public.live_replays FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_replays.live_session_id
        AND COALESCE(ls.privacy, 'public') = 'public'
    )
  );

CREATE OR REPLACE FUNCTION public.update_live_replays_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_live_replays_updated_at ON public.live_replays;
CREATE TRIGGER trg_live_replays_updated_at
  BEFORE UPDATE ON public.live_replays
  FOR EACH ROW EXECUTE FUNCTION public.update_live_replays_updated_at();

ALTER TABLE public.live_replays REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_replays;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
