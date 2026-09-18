
CREATE TABLE IF NOT EXISTS public.wallet_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL CHECK (chain IN ('btc','bep20_usdt','bnb','all')),
  trigger text NOT NULL DEFAULT 'cron' CHECK (trigger IN ('cron','manual')),
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  wallets_scanned int NOT NULL DEFAULT 0,
  txs_found int NOT NULL DEFAULT 0,
  txs_backfilled int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.wallet_reconciliation_runs TO authenticated;
GRANT ALL ON public.wallet_reconciliation_runs TO service_role;
ALTER TABLE public.wallet_reconciliation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read runs" ON public.wallet_reconciliation_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_recon_runs_started ON public.wallet_reconciliation_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS public.wallet_reconciliation_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.wallet_reconciliation_runs(id) ON DELETE CASCADE,
  chain text NOT NULL,
  tx_hash text,
  address text,
  user_id uuid,
  action text NOT NULL CHECK (action IN ('backfilled','skipped_internal_dup','skipped_external','skipped_old','error')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_reconciliation_findings TO authenticated;
GRANT ALL ON public.wallet_reconciliation_findings TO service_role;
ALTER TABLE public.wallet_reconciliation_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read findings" ON public.wallet_reconciliation_findings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_recon_findings_run ON public.wallet_reconciliation_findings(run_id);
CREATE INDEX IF NOT EXISTS idx_recon_findings_tx ON public.wallet_reconciliation_findings(tx_hash);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_hash_user_dir_uniq
  ON public.transactions(tx_hash, user_id, from_address, to_address)
  WHERE tx_hash IS NOT NULL;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['like','love','care','wow','haha','pray','sad','angry','comment','comment_like','comment_reply','share','post_tagged','friend_request','friend_accept','friend_accepted','friend_removed','reward_approved','reward_rejected','account_banned','account_unbanned','donation','claim_reward','admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily','live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info','mint_request_rejected','live_replay_failed','live_replay_expiring','live_replay_expired','live_auto_ended','live_reconnected','quest_completed','streak_milestone','sbt_issued_quest','mystery_box_received','mystery_box_legendary','mystery_box_expiring','mystery_box_expired','guardian_invited','guardian_accepted','guardian_declined','attestation_received','did_promoted','sbt_issued','dispute_resolved','recovery_initiated','pet_evolved','pet_cosmetic_received','pet_xp_granted','pet_cheer_received','pet_shop_purchased','pet_shop_failed','pet_battle_challenge','pet_battle_result','buddy_invite','pet_lumi_ready','treasury_low_gas','treasury_low_camly','treasury_ledger_drift','live_recording_missed','live_recording_failed','fun_mint_signed','fun_mint_confirmed','impersonation_alert','impersonation_confirmed','impersonation_dismissed','wallet_reconciliation_alert']));
