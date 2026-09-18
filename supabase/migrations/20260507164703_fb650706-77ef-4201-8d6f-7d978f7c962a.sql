-- Backfill 1: heal record đã có R2 + post nhưng bị đánh failed do race 404
UPDATE public.live_replays
SET archive_status = 'archived',
    archive_error = NULL,
    archived_at = COALESCE(archived_at, updated_at)
WHERE archive_status = 'failed'
  AND r2_video_url IS NOT NULL
  AND replay_post_id IS NOT NULL;

-- Backfill 2: reset record stuck ở 'archiving' > 10 phút để cron pick lại
UPDATE public.live_replays
SET archive_status = 'pending',
    archive_next_retry_at = now(),
    archive_error = NULL
WHERE archive_status = 'archiving'
  AND updated_at < now() - interval '10 minutes';