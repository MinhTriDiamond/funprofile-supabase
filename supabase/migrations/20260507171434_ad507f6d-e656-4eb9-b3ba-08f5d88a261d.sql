ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS webm_source_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS chunks_deleted_at timestamptz;

COMMENT ON COLUMN public.live_replays.webm_source_deleted_at IS 'Thời điểm xoá file replay.webm nguồn trên R2 sau khi MP4 archive thành công.';
COMMENT ON COLUMN public.live_replays.chunks_deleted_at IS 'Thời điểm xoá toàn bộ chunk-*.webm trên R2 sau khi MP4 archive thành công.';