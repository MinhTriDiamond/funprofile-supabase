-- 1. Thêm cột grace period vào live_sessions
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS source_disconnected_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS auto_end_at TIMESTAMPTZ NULL;

-- 2. Index cho watchdog quét nhanh
CREATE INDEX IF NOT EXISTS idx_live_sessions_auto_end
  ON public.live_sessions (auto_end_at)
  WHERE auto_end_at IS NOT NULL AND status = 'live';

-- 3. Mở rộng CHECK constraint notifications.type — thêm live_auto_ended + live_reconnected (dự phòng)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (ARRAY[
    'like','love','care','wow','haha','pray','sad','angry',
    'comment','comment_like','comment_reply','share',
    'friend_request','friend_accept','friend_accepted','friend_removed',
    'reward_approved','reward_rejected','account_banned','account_unbanned',
    'donation','claim_reward',
    'admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily',
    'live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info',
    'mint_request_rejected',
    'live_replay_failed','live_replay_expiring','live_replay_expired',
    'live_auto_ended','live_reconnected'
  ])
);