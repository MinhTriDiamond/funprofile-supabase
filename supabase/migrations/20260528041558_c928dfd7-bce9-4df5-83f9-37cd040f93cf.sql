UPDATE public.live_sessions
SET status = 'processing',
    recording_status = 'stopped',
    archive_status = 'pending',
    error_message = NULL,
    recording_error = NULL,
    archive_error = NULL,
    updated_at = now() - interval '1 day'
WHERE mode = 'agora_webcam'
  AND created_at > now() - interval '24 hours'
  AND replay_url IS NULL
  AND status IN ('failed','processing','ended');