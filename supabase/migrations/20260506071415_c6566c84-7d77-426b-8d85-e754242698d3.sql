ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS concat_upload_id TEXT,
  ADD COLUMN IF NOT EXISTS concat_completed_parts JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS concat_plan JSONB,
  ADD COLUMN IF NOT EXISTS concat_next_part INT DEFAULT 0;

-- Reset 3 replay queued sai (thiếu snapshot) về awaiting_chunks
UPDATE public.live_replays
SET status = 'awaiting_chunks',
    last_cf_status = 'reset_missing_snapshot',
    stream_uid = NULL
WHERE cloudflare_vod_enabled = true
  AND status = 'queued'
  AND snapshot_total_bytes IS NULL;

-- Reset 2 replay normalizing đang loop concat (huỷ uploadId cũ qua việc xoá state)
UPDATE public.live_replays
SET concat_started_at = NULL,
    concat_upload_id = NULL,
    concat_completed_parts = '[]'::jsonb,
    concat_plan = NULL,
    concat_next_part = 0,
    last_cf_status = 'reset_for_resumable_concat'
WHERE cloudflare_vod_enabled = true
  AND status = 'normalizing';

-- Reset replay concat_failed về normalizing để thử lại với resumable engine
UPDATE public.live_replays
SET status = 'normalizing',
    concat_started_at = NULL,
    concat_upload_id = NULL,
    concat_completed_parts = '[]'::jsonb,
    concat_plan = NULL,
    concat_next_part = 0,
    last_cf_status = 'retry_after_resumable_fix'
WHERE cloudflare_vod_enabled = true
  AND last_cf_status IN ('concat_failed');