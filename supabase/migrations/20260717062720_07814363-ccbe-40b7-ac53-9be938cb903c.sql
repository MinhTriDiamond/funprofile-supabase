
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY[
  'account_banned'::text, 'account_unbanned'::text, 'admin_email_farm'::text, 'admin_fraud_daily'::text,
  'admin_shared_device'::text, 'attestation_received'::text, 'btc_guard_drift'::text, 'buddy_invite'::text,
  'care'::text, 'claim_reward'::text, 'comment'::text, 'comment_like'::text, 'did_promoted'::text,
  'donation'::text, 'epoch_claim_ready'::text, 'epoch_reset_info'::text, 'friend_accepted'::text,
  'friend_removed'::text, 'friend_request'::text, 'fun_mint_confirmed'::text, 'fun_mint_signed'::text,
  'haha'::text, 'impersonation_alert'::text, 'like'::text, 'live_replay_failed'::text,
  'live_started'::text, 'love'::text, 'mint_request_rejected'::text, 'mystery_box_legendary'::text,
  'mystery_box_received'::text, 'pet_battle_challenge'::text, 'pet_battle_result'::text,
  'pet_lumi_ready'::text, 'post_tagged'::text, 'post_moderation_hint'::text, 'pray'::text,
  'recovery_initiated'::text, 'reward_adjustment'::text, 'sbt_issued'::text, 'sbt_issued_quest'::text,
  'wallet_reconciliation_alert'::text, 'wow'::text
])));
