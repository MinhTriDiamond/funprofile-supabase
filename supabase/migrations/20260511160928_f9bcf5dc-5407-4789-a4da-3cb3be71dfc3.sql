ALTER TABLE public.live_sessions DROP CONSTRAINT IF EXISTS live_sessions_status_check;
ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check
  CHECK (status IN (
    'created','waiting_for_obs','source_connected','ready_to_go_live',
    'live','ended','processing','archiving','posted',
    'processing_stream','stream_ready','exporting_mp4',
    'uploading_r2','verifying_r2','archived','replay_posted',
    'stream_deleted','failed'
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
  ADD COLUMN IF NOT EXISTS replay_ready boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS processing_message text;

DROP POLICY IF EXISTS "live_replays_public_read_ready" ON public.live_replays;
CREATE POLICY "live_replays_public_read_ready"
  ON public.live_replays
  FOR SELECT
  USING (
    status::text IN ('ready','archived','posted')
    OR archive_status IN ('archived','replay_posted','stream_deleted')
  );

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_archive_status
  ON public.live_sessions (mode, archive_status, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_posts_replay_status
  ON public.posts (replay_status, replay_ready, updated_at);
