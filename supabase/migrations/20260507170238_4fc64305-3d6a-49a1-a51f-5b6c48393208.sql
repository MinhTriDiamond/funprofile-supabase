-- Doc comment các giá trị hợp lệ
COMMENT ON COLUMN public.live_replays.archive_status IS
  'Trạng thái archive R2: pending | archiving | archived | failed | unrecoverable | skipped_legacy';

-- Backfill: replay đã fail >=3 lần với MP4 404 và không có R2 → unrecoverable
UPDATE public.live_replays
SET archive_status = 'unrecoverable',
    archive_next_retry_at = NULL,
    last_error_at = now()
WHERE archive_status IN ('failed','pending')
  AND r2_video_url IS NULL
  AND r2_object_key IS NULL
  AND COALESCE(archive_attempts, 0) >= 3
  AND (archive_error ILIKE '%404%' OR archive_error ILIKE '%not found%');

-- Đồng bộ skipped_legacy
UPDATE public.live_replays
SET archive_status = 'skipped_legacy',
    archive_next_retry_at = NULL
WHERE status = 'skipped_legacy'
  AND archive_status NOT IN ('archived','skipped_legacy');