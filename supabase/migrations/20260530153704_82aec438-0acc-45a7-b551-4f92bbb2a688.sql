-- 1. Mở rộng CHECK của live_sessions.recording_status thêm 'missed'
ALTER TABLE public.live_sessions DROP CONSTRAINT IF EXISTS live_sessions_recording_status_check;
ALTER TABLE public.live_sessions ADD CONSTRAINT live_sessions_recording_status_check
  CHECK (
    recording_status IS NULL
    OR recording_status = ANY (ARRAY[
      'idle','acquiring','starting','recording','started','stopping','stopped',
      'processing','ready','failed','error','skipped','missing_ids','missed'
    ])
  );

-- 2. Thêm cột recovery_attempts để cron throttle
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS recovery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_recovery_at timestamptz;

-- 3. Mở rộng CHECK của notifications.type thêm 2 loại
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'like','love','care','wow','haha','pray','sad','angry','comment','comment_like',
    'comment_reply','share','post_tagged','friend_request','friend_accept','friend_accepted',
    'friend_removed','reward_approved','reward_rejected','account_banned','account_unbanned',
    'donation','claim_reward','admin_shared_device','admin_email_farm','admin_blacklisted_ip',
    'admin_fraud_daily','live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info',
    'mint_request_rejected','live_replay_failed','live_replay_expiring','live_replay_expired',
    'live_auto_ended','live_reconnected','quest_completed','streak_milestone','sbt_issued_quest',
    'mystery_box_received','mystery_box_legendary','mystery_box_expiring','mystery_box_expired',
    'guardian_invited','guardian_accepted','guardian_declined','attestation_received',
    'did_promoted','sbt_issued','dispute_resolved','recovery_initiated','pet_evolved',
    'pet_cosmetic_received','pet_xp_granted','pet_cheer_received','pet_shop_purchased',
    'pet_shop_failed','pet_battle_challenge','pet_battle_result','buddy_invite','pet_lumi_ready',
    'treasury_low_gas','treasury_low_camly','treasury_ledger_drift',
    'live_recording_missed','live_recording_failed'
  ]));

-- 4. Index hỗ trợ orphan-recover scan nhanh
CREATE INDEX IF NOT EXISTS idx_live_sessions_orphan_recover
  ON public.live_sessions (status, recording_status, ended_at)
  WHERE status = 'ended' AND recording_status IN ('idle','processing');