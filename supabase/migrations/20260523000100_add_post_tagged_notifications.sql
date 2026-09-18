ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'like','love','care','wow','haha','pray','sad','angry',
  'comment','comment_like','comment_reply','share','post_tagged',
  'friend_request','friend_accept','friend_accepted','friend_removed',
  'reward_approved','reward_rejected','account_banned','account_unbanned',
  'donation','claim_reward',
  'admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily',
  'live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info','mint_request_rejected',
  'live_replay_failed','live_replay_expiring','live_replay_expired','live_auto_ended','live_reconnected',
  'quest_completed','streak_milestone','sbt_issued_quest',
  'mystery_box_received','mystery_box_legendary','mystery_box_expiring','mystery_box_expired',
  'guardian_invited','guardian_accepted','guardian_declined','attestation_received',
  'did_promoted','sbt_issued','dispute_resolved','recovery_initiated',
  'pet_evolved','pet_cosmetic_received','pet_xp_granted','pet_cheer_received',
  'pet_shop_purchased','pet_shop_failed',
  'pet_battle_challenge','pet_battle_result'
]));
