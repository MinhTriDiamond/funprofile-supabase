-- Webcam replay retry policy: per-session retry counter + reset stuck sessions
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS archive_retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archive_next_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_live_sessions_archive_retry
  ON public.live_sessions (archive_next_retry_at)
  WHERE replay_url IS NULL AND archive_status IN ('pending','failed');

-- Backfill: hồi sinh 109 pending + 74 failed session (7 ngày qua) bị kẹt do
-- pipeline cũ throw ngay khi 1 file R2 lỗi tạm thời. Reset về pending để cron
-- xử lý lại với processor đã được vá retry per-file.
UPDATE public.live_sessions
SET archive_status = 'pending',
    recording_status = CASE WHEN recording_status = 'failed' THEN 'stopped' ELSE recording_status END,
    archive_retry_count = 0,
    archive_next_retry_at = now(),
    archive_error = NULL,
    recording_error = NULL,
    error_message = NULL,
    updated_at = now()
WHERE mode = 'agora_webcam'
  AND replay_url IS NULL
  AND archive_status IN ('pending','failed')
  AND created_at > now() - interval '7 days';

NOTIFY pgrst, 'reload schema';