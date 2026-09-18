-- 1. Mở rộng CHECK constraint notifications.type để chấp nhận các loại liên quan đến replay
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (ARRAY[
    'like','love','care','wow','haha','pray','sad','angry',
    'comment','comment_like','comment_reply','share',
    'friend_request','friend_accept','friend_accepted','friend_removed',
    'reward_approved','reward_rejected','account_banned','account_unbanned',
    'donation','claim_reward',
    'admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily',
    'live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info','mint_request_rejected',
    'live_replay_failed','live_replay_expiring','live_replay_expired'
  ])
);

-- 2. Đánh dấu replay f4633001 là unrecoverable
UPDATE public.live_replays
SET archive_status = 'unrecoverable',
    archive_error = 'MP4 kẹt 0% sau 16 lần thử. Cloudflare Stream không thể transcode (live quá ngắn / kết nối ngắt bất thường). Resolved 11/05/2026.',
    archive_next_retry_at = NULL,
    last_error_at = NOW(),
    error_message = 'MP4 not ready (0%) - admin resolved'
WHERE id = 'f4633001-125c-4040-8c63-4a8687ca5729'
  AND archive_status = 'failed';

-- 3. Update related live_sessions (chỉ khi không còn live)
UPDATE public.live_sessions
SET recording_status = 'failed',
    recording_error = 'replay_unrecoverable_mp4_stuck_zero',
    archive_status = 'unrecoverable',
    archive_error = 'MP4 kẹt 0% trên Cloudflare Stream.'
WHERE id = (
  SELECT live_session_id FROM public.live_replays
  WHERE id = 'f4633001-125c-4040-8c63-4a8687ca5729'
)
AND status != 'live';

-- 4. Gửi notification (idempotent — không insert nếu đã có)
INSERT INTO public.notifications (user_id, actor_id, type, metadata)
SELECT
  lr.user_id,
  lr.user_id,  -- self-actor cho system notif
  'live_replay_failed',
  jsonb_build_object(
    'replay_id', lr.id,
    'live_session_id', lr.live_session_id,
    'reason', 'mp4_stuck_zero',
    'message', 'Phiên livestream lúc 08:58 ngày 11/05/2026 không lưu được bản ghi do Cloudflare không trả về video. Lần sau hãy đảm bảo OBS chạy đủ ít nhất 1 phút trước khi kết thúc nhé.'
  )
FROM public.live_replays lr
WHERE lr.id = 'f4633001-125c-4040-8c63-4a8687ca5729'
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = lr.user_id
      AND n.type = 'live_replay_failed'
      AND n.metadata->>'replay_id' = lr.id::text
  );