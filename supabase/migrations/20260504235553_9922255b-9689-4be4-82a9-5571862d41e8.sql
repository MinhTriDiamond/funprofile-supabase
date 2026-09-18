ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS tus_upload_url text,
  ADD COLUMN IF NOT EXISTS tus_offset bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_chunk_seq integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_chunks_for_ingest integer,
  ADD COLUMN IF NOT EXISTS ingest_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ingest_at timestamptz;

CREATE INDEX IF NOT EXISTS live_replays_ingest_queue_idx
  ON public.live_replays(status, last_ingest_at NULLS FIRST)
  WHERE status IN ('queued','uploading');