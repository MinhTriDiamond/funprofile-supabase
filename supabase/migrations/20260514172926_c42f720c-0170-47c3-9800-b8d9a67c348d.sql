-- Phase 1: Add missing columns required by live-replay-archive-cron state machine
ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS archive_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS archive_phase text,
  ADD COLUMN IF NOT EXISTS archive_next_retry_at timestamptz;

-- Ensure archive_attempts exists (no-op if already present)
ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS archive_attempts int NOT NULL DEFAULT 0;

-- Index for fast cron filtering
CREATE INDEX IF NOT EXISTS idx_live_replays_archive_lease
  ON public.live_replays (archive_status, archive_lease_until)
  WHERE archive_status IN ('pending','failed','archiving','processing_stream','stream_ready','exporting_mp4','uploading_r2','verifying_r2','r2_ready','replay_posted','stream_deleted');