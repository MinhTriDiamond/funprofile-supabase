ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_btc_address_format_chk
  CHECK (
    btc_address IS NULL
    OR btc_address ~ '^bc1[a-z0-9]{25,59}$'
    OR btc_address ~ '^[13][1-9A-HJ-NP-Za-km-z]{25,39}$'
  ) NOT VALID;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'account_banned','account_unbanned','admin_email_farm','admin_fraud_daily','admin_shared_device',
  'attestation_received','btc_guard_drift','btc_address_cleared','token_price_fetch_failed','buddy_invite','care',
  'claim_reward','comment','comment_like','did_promoted','donation','epoch_claim_ready','epoch_reset_info',
  'friend_accepted','friend_removed','friend_request','fun_mint_confirmed','fun_mint_signed','haha',
  'impersonation_alert','like','live_replay_failed','live_started','love','mint_request_rejected',
  'mystery_box_legendary','mystery_box_received','pet_battle_challenge','pet_battle_result','pet_lumi_ready',
  'post_tagged','post_moderation_hint','pray','recovery_initiated','reward_adjustment','sbt_issued',
  'sbt_issued_quest','wallet_reconciliation_alert','wow'
]));