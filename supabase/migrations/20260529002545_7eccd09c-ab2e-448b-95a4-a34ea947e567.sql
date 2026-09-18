ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS replay_status text NOT NULL DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS playback_type text,
  ADD COLUMN IF NOT EXISTS temp_bucket text,
  ADD COLUMN IF NOT EXISTS temp_prefix text,
  ADD COLUMN IF NOT EXISTS temp_hls_key text,
  ADD COLUMN IF NOT EXISTS temp_hls_url text,
  ADD COLUMN IF NOT EXISTS temp_mp4_key text,
  ADD COLUMN IF NOT EXISTS archive_bucket text,
  ADD COLUMN IF NOT EXISTS archive_mp4_key text,
  ADD COLUMN IF NOT EXISTS archive_mp4_url text,
  ADD COLUMN IF NOT EXISTS temp_total_size bigint,
  ADD COLUMN IF NOT EXISTS archive_file_size bigint,
  ADD COLUMN IF NOT EXISTS hls_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cleanup_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cleanup_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.live_replays
  DROP CONSTRAINT IF EXISTS live_replays_replay_status_check;
ALTER TABLE public.live_replays
  ADD CONSTRAINT live_replays_replay_status_check
  CHECK (replay_status = ANY (ARRAY['processing','ready_hls','archiving','ready_mp4','failed']));

ALTER TABLE public.live_replays
  DROP CONSTRAINT IF EXISTS live_replays_playback_type_check;
ALTER TABLE public.live_replays
  ADD CONSTRAINT live_replays_playback_type_check
  CHECK (playback_type IS NULL OR playback_type = ANY (ARRAY['processing','hls','mp4']));

ALTER TABLE public.live_replays
  DROP CONSTRAINT IF EXISTS live_replays_cleanup_status_check;
ALTER TABLE public.live_replays
  ADD CONSTRAINT live_replays_cleanup_status_check
  CHECK (cleanup_status = ANY (ARRAY['pending','cleanup_pending','cleaned','failed']));

CREATE INDEX IF NOT EXISTS idx_live_replays_agora_replay_status
  ON public.live_replays(replay_status, archive_status, cleanup_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_replays_cleanup_due
  ON public.live_replays(cleanup_status, cleanup_next_retry_at)
  WHERE replay_status = 'ready_mp4' AND archive_mp4_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_replays_temp_prefix
  ON public.live_replays(temp_bucket, temp_prefix)
  WHERE temp_prefix IS NOT NULL;