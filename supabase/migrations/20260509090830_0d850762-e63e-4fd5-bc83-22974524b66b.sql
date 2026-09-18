-- Dual Live Mode + Live Replay Archiving Pipeline: live_sessions schema expansion
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'agora_webcam',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS agora_channel_name text,
  ADD COLUMN IF NOT EXISTS agora_uid integer,
  ADD COLUMN IF NOT EXISTS cloudflare_live_input_id text,
  ADD COLUMN IF NOT EXISTS cloudflare_video_uid text,
  ADD COLUMN IF NOT EXISTS rtmps_url text,
  ADD COLUMN IF NOT EXISTS stream_key_encrypted text,
  ADD COLUMN IF NOT EXISTS playback_url text,
  ADD COLUMN IF NOT EXISTS hls_url text,
  ADD COLUMN IF NOT EXISTS cloudflare_mp4_download_url text,
  ADD COLUMN IF NOT EXISTS r2_object_key text,
  ADD COLUMN IF NOT EXISTS r2_bucket text,
  ADD COLUMN IF NOT EXISTS r2_video_url text,
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'cloudflare_stream',
  ADD COLUMN IF NOT EXISTS playback_provider text NOT NULL DEFAULT 'cloudflare_stream',
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS archive_error text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS stream_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.live_sessions
SET user_id = COALESCE(user_id, owner_id, host_user_id),
    agora_channel_name = COALESCE(agora_channel_name, agora_channel, channel_name),
    agora_uid = COALESCE(agora_uid, agora_uid_host)
WHERE user_id IS NULL OR agora_channel_name IS NULL OR agora_uid IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_sessions_status_check'
      AND conrelid = 'public.live_sessions'::regclass
  ) THEN
    ALTER TABLE public.live_sessions DROP CONSTRAINT live_sessions_status_check;
  END IF;
END $$;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check
  CHECK (status IN ('created', 'waiting_for_obs', 'live', 'ended', 'processing', 'archiving', 'posted', 'failed'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_sessions_mode_check'
      AND conrelid = 'public.live_sessions'::regclass
  ) THEN
    ALTER TABLE public.live_sessions
      ADD CONSTRAINT live_sessions_mode_check CHECK (mode IN ('agora_webcam', 'rtmp_obs'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_live_sessions_mode_status
  ON public.live_sessions(mode, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_sessions_cloudflare_live_input
  ON public.live_sessions(cloudflare_live_input_id)
  WHERE cloudflare_live_input_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_cloudflare_video_uid
  ON public.live_sessions(cloudflare_video_uid)
  WHERE cloudflare_video_uid IS NOT NULL;

DROP POLICY IF EXISTS "public can read live sessions" ON public.live_sessions;
CREATE POLICY "public can read live sessions"
  ON public.live_sessions FOR SELECT
  TO anon, authenticated
  USING (status IN ('live', 'ended', 'processing', 'archiving', 'posted'));

DROP POLICY IF EXISTS "owner can read own live sessions" ON public.live_sessions;
CREATE POLICY "owner can read own live sessions"
  ON public.live_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = host_user_id OR auth.uid() = owner_id OR auth.uid() = user_id);