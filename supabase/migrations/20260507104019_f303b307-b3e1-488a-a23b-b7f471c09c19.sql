
-- Archive livestream replays to Cloudflare R2 immediately after Cloudflare Stream processing.

ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS cloudflare_video_uid text,
  ADD COLUMN IF NOT EXISTS cloudflare_playback_url text,
  ADD COLUMN IF NOT EXISTS cloudflare_mp4_download_url text,
  ADD COLUMN IF NOT EXISTS r2_object_key text,
  ADD COLUMN IF NOT EXISTS r2_bucket text,
  ADD COLUMN IF NOT EXISTS r2_video_url text,
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'cloudflare_stream',
  ADD COLUMN IF NOT EXISTS playback_provider text NOT NULL DEFAULT 'cloudflare_stream',
  ADD COLUMN IF NOT EXISTS archive_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS archive_error text,
  ADD COLUMN IF NOT EXISTS archive_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archive_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS stream_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_post_id uuid;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_replays_archive_retry
  ON public.live_replays(archive_status, archive_next_retry_at)
  WHERE archive_status IN ('pending', 'failed', 'archiving');

CREATE INDEX IF NOT EXISTS idx_live_replays_r2_object_key
  ON public.live_replays(r2_object_key)
  WHERE r2_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_replays_stream_cleanup
  ON public.live_replays(stream_uid, stream_deleted_at)
  WHERE stream_uid IS NOT NULL AND stream_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts_deleted_at
  ON public.posts(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.creator_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  live_session_id uuid REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  live_replay_id uuid UNIQUE REFERENCES public.live_replays(id) ON DELETE SET NULL,
  title text,
  media_type text NOT NULL DEFAULT 'video',
  storage_provider text NOT NULL DEFAULT 'r2',
  playback_provider text NOT NULL DEFAULT 'r2',
  r2_object_key text,
  r2_bucket text,
  r2_video_url text,
  thumbnail_url text,
  duration_seconds integer,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_library_user_created
  ON public.creator_library(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.creator_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own creator library" ON public.creator_library;
CREATE POLICY "Users can view own creator library"
  ON public.creator_library FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own creator library" ON public.creator_library;
CREATE POLICY "Users can update own creator library"
  ON public.creator_library FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own creator library" ON public.creator_library;
CREATE POLICY "Users can insert own creator library"
  ON public.creator_library FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_creator_library_updated_at ON public.creator_library;
CREATE TRIGGER update_creator_library_updated_at
BEFORE UPDATE ON public.creator_library
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
