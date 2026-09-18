-- Production-grade RTMP replay archive lifecycle.
-- Cloudflare Stream is temporary ingest/transcode storage; R2 is permanent replay storage.

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
  CHECK (status IN (
    'created',
    'waiting_for_obs',
    'source_connected',
    'ready_to_go_live',
    'live',
    'ended',
    'processing',
    'archiving',
    'posted',
    'processing_stream',
    'stream_ready',
    'exporting_mp4',
    'uploading_r2',
    'verifying_r2',
    'archived',
    'replay_posted',
    'stream_deleted',
    'failed'
  ));

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS cloudflare_input_id text,
  ADD COLUMN IF NOT EXISTS r2_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS cloudflare_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delete_stream_error text;

UPDATE public.live_sessions
SET cloudflare_input_id = COALESCE(cloudflare_input_id, cloudflare_live_input_id)
WHERE cloudflare_input_id IS NULL AND cloudflare_live_input_id IS NOT NULL;

UPDATE public.live_sessions
SET cloudflare_deleted_at = COALESCE(cloudflare_deleted_at, stream_deleted_at)
WHERE cloudflare_deleted_at IS NULL AND stream_deleted_at IS NOT NULL;

ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS cloudflare_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delete_stream_error text,
  ADD COLUMN IF NOT EXISTS r2_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_ready_at timestamptz;

UPDATE public.live_replays
SET cloudflare_deleted_at = COALESCE(cloudflare_deleted_at, stream_deleted_at)
WHERE cloudflare_deleted_at IS NULL AND stream_deleted_at IS NOT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS replay_status text,
  ADD COLUMN IF NOT EXISTS playback_provider text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS replay_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS processing_message text;

DROP POLICY IF EXISTS "public can read live sessions" ON public.live_sessions;
CREATE POLICY "public can read live sessions"
  ON public.live_sessions FOR SELECT
  TO anon, authenticated
  USING (status IN (
    'live',
    'ended',
    'processing',
    'archiving',
    'posted',
    'processing_stream',
    'stream_ready',
    'exporting_mp4',
    'uploading_r2',
    'verifying_r2',
    'archived',
    'replay_posted',
    'stream_deleted'
  ));

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_archive_status
  ON public.live_sessions(mode, status, archive_status, updated_at DESC)
  WHERE mode = 'rtmp_obs' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts_replay_status
  ON public.posts(replay_status, replay_ready)
  WHERE post_type = 'live';

