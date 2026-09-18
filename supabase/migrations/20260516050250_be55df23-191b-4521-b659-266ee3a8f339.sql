
-- 1) Mở rộng CHECK constraint notifications.type để đón các loại Identity
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (ARRAY[
    'like','love','care','wow','haha','pray','sad','angry',
    'comment','comment_like','comment_reply','share',
    'friend_request','friend_accept','friend_accepted','friend_removed',
    'reward_approved','reward_rejected','account_banned','account_unbanned',
    'donation','claim_reward',
    'admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily',
    'live_started','reward_adjustment',
    'epoch_claim_ready','epoch_reset_info','mint_request_rejected',
    'live_replay_failed','live_replay_expiring','live_replay_expired',
    'live_auto_ended','live_reconnected',
    'quest_completed','streak_milestone','sbt_issued_quest',
    'mystery_box_received','mystery_box_legendary','mystery_box_expiring','mystery_box_expired',
    -- Identity Layer
    'guardian_invited','guardian_accepted','guardian_declined',
    'attestation_received',
    'did_promoted','sbt_issued','dispute_resolved','recovery_initiated'
  ])
);

-- 2) Backfill identity_links cho wallet đã có trong custodial_wallets
INSERT INTO public.identity_links (did_id, link_type, link_value, verification_state, verified_at, metadata)
SELECT d.did_id, 'wallet', lower(c.wallet_address), 'verified', now(),
       jsonb_build_object('source','backfill','wallet_kind','custodial','chain_id',c.chain_id)
FROM public.custodial_wallets c
JOIN public.did_registry d ON d.owner_user_id = c.user_id
WHERE c.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.identity_links il
    WHERE il.did_id = d.did_id AND il.link_type = 'wallet'
      AND lower(il.link_value) = lower(c.wallet_address)
  )
ON CONFLICT DO NOTHING;

-- 3) Backfill identity_links cho external_wallet_address trong profiles
INSERT INTO public.identity_links (did_id, link_type, link_value, verification_state, verified_at, metadata)
SELECT d.did_id, 'wallet', lower(p.external_wallet_address), 'verified', now(),
       jsonb_build_object('source','backfill','wallet_kind','external')
FROM public.profiles p
JOIN public.did_registry d ON d.owner_user_id = p.id
WHERE p.external_wallet_address IS NOT NULL
  AND length(p.external_wallet_address) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.identity_links il
    WHERE il.did_id = d.did_id AND il.link_type = 'wallet'
      AND lower(il.link_value) = lower(p.external_wallet_address)
  )
ON CONFLICT DO NOTHING;

-- 4) Index hỗ trợ chống gửi trùng attestation trong 24h
CREATE INDEX IF NOT EXISTS idx_att_dup_window
  ON public.attestation_log (from_did, to_did, attestation_type, created_at DESC);
