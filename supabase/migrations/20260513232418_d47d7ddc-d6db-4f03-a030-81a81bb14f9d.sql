
ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS mp4_export_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mp4_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mp4_total_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS multipart_upload_id TEXT,
  ADD COLUMN IF NOT EXISTS multipart_part_size BIGINT,
  ADD COLUMN IF NOT EXISTS multipart_total_parts INTEGER,
  ADD COLUMN IF NOT EXISTS multipart_parts_done JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS multipart_bytes_done BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archive_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_phase TEXT;

CREATE INDEX IF NOT EXISTS idx_live_replays_phase_lease
  ON public.live_replays (archive_phase, archive_lease_until)
  WHERE archive_phase IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_replays_mp4_wait
  ON public.live_replays (archive_phase)
  WHERE archive_phase = 'mp4_wait';
