-- Retry recent Agora webcam replays that are stuck before durable MP4 archive.
-- This does not delete posts or change ownership/schema; it only makes eligible
-- sessions visible to the hardened recording processor again.
UPDATE public.live_sessions
SET archive_status = 'pending',
    archive_retry_count = 0,
    archive_next_retry_at = now(),
    archive_error = NULL,
    error_message = NULL,
    updated_at = now()
WHERE mode = 'agora_webcam'
  AND deleted_at IS NULL
  AND created_at > now() - interval '7 days'
  AND (archive_status IS NULL OR archive_status IN ('pending', 'failed', 'archiving'))
  AND r2_video_url IS NULL
  AND (
    replay_url IS NOT NULL
    OR playback_url IS NOT NULL
    OR hls_url IS NOT NULL
    OR temp_object_key IS NOT NULL
    OR last_worker_response IS NOT NULL
  );
