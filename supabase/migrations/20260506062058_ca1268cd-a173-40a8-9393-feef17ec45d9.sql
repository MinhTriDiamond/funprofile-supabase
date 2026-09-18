
ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS snapshot_total_bytes  bigint,
  ADD COLUMN IF NOT EXISTS snapshot_total_chunks integer,
  ADD COLUMN IF NOT EXISTS snapshot_frozen_at    timestamptz,
  ADD COLUMN IF NOT EXISTS chunks_stable_since   timestamptz,
  ADD COLUMN IF NOT EXISTS tus_reset_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS normalized_object_key text;

CREATE INDEX IF NOT EXISTS idx_live_replays_awaiting_chunks
  ON public.live_replays(status, created_at)
  WHERE status = 'awaiting_chunks' AND cloudflare_vod_enabled = true;

CREATE INDEX IF NOT EXISTS idx_live_replays_snapshot_queued
  ON public.live_replays(status, last_ingest_at)
  WHERE status IN ('queued','uploading') AND cloudflare_vod_enabled = true;
