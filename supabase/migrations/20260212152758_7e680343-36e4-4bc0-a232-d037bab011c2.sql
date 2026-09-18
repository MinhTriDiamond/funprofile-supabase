
-- =============================================
-- Phase 1: FUN Money Minting System - New Tables
-- Adds new PPLP tables alongside existing light_actions/pplp_mint_requests
-- =============================================

-- 1. PPLP Actions (Light Actions from Angel AI)
CREATE TABLE IF NOT EXISTS public.pplp_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id TEXT NOT NULL DEFAULT 'fun_profile',
  action_type TEXT NOT NULL,
  action_type_enum TEXT,
  actor_id UUID NOT NULL,
  target_id UUID,
  metadata JSONB DEFAULT '{}',
  impact JSONB DEFAULT '{}',
  integrity JSONB DEFAULT '{}',
  evidence_hash TEXT,
  canonical_hash TEXT,
  policy_version TEXT,
  policy_snapshot JSONB,
  status TEXT DEFAULT 'pending',
  scored_at TIMESTAMPTZ,
  minted_at TIMESTAMPTZ,
  mint_request_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. PPLP Scores (5 Pillar Scoring)
CREATE TABLE IF NOT EXISTS public.pplp_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID REFERENCES public.pplp_actions(id) UNIQUE,
  pillar_s NUMERIC NOT NULL DEFAULT 0,
  pillar_t NUMERIC NOT NULL DEFAULT 0,
  pillar_h NUMERIC NOT NULL DEFAULT 0,
  pillar_c NUMERIC NOT NULL DEFAULT 0,
  pillar_u NUMERIC NOT NULL DEFAULT 0,
  light_score NUMERIC NOT NULL DEFAULT 0,
  base_reward INTEGER DEFAULT 0,
  multiplier_q NUMERIC DEFAULT 1.0,
  multiplier_i NUMERIC DEFAULT 1.0,
  multiplier_k NUMERIC DEFAULT 1.0,
  final_reward INTEGER NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'pending',
  decision_reason TEXT,
  fail_reasons TEXT[],
  scored_by TEXT,
  policy_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PPLP Evidences
CREATE TABLE IF NOT EXISTS public.pplp_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID REFERENCES public.pplp_actions(id),
  evidence_type TEXT NOT NULL,
  evidence_type_enum TEXT,
  uri TEXT,
  content_hash TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. FUN Distribution Logs (4-Tier Cascade)
CREATE TABLE IF NOT EXISTS public.fun_distribution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  mint_request_id UUID,
  total_reward INTEGER NOT NULL DEFAULT 0,
  user_amount INTEGER NOT NULL DEFAULT 0,
  user_percentage NUMERIC NOT NULL DEFAULT 0,
  genesis_amount INTEGER DEFAULT 0,
  genesis_percentage NUMERIC DEFAULT 0,
  platform_amount INTEGER DEFAULT 0,
  platform_percentage NUMERIC DEFAULT 0,
  partners_amount INTEGER DEFAULT 0,
  partners_percentage NUMERIC DEFAULT 0,
  fund_processing_status TEXT DEFAULT 'pending',
  fund_processed_at TIMESTAMPTZ,
  fund_tx_hashes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Pool Config (4-Tier Cascade)
CREATE TABLE IF NOT EXISTS public.fun_pool_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_name TEXT NOT NULL,
  pool_label TEXT NOT NULL,
  retention_rate NUMERIC DEFAULT 0,
  tier_order INTEGER,
  wallet_address TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. User Caps (Diminishing Returns)
CREATE TABLE IF NOT EXISTS public.pplp_user_caps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  epoch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  epoch_type TEXT DEFAULT 'daily',
  total_minted BIGINT DEFAULT 0,
  action_counts JSONB DEFAULT '{}',
  last_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, epoch_date, epoch_type)
);

-- 7. Action Caps Config
CREATE TABLE IF NOT EXISTS public.pplp_action_caps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  platform_id TEXT DEFAULT 'ALL',
  base_reward INTEGER DEFAULT 100,
  max_per_user_daily INTEGER,
  max_per_user_weekly INTEGER,
  max_global_daily INTEGER,
  cooldown_seconds INTEGER DEFAULT 0,
  diminishing_threshold INTEGER DEFAULT 5,
  diminishing_factor NUMERIC DEFAULT 0.8,
  min_quality_score NUMERIC DEFAULT 0.5,
  thresholds JSONB DEFAULT '{}',
  multiplier_ranges JSONB DEFAULT '{"Q":[0.5,3],"I":[0.5,5],"K":[0,1]}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. User Tiers (Reputation)
CREATE TABLE IF NOT EXISTS public.pplp_user_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  tier INTEGER DEFAULT 0,
  trust_score NUMERIC DEFAULT 50,
  cap_multiplier NUMERIC DEFAULT 1.0,
  total_actions_scored INTEGER DEFAULT 0,
  passed_actions INTEGER DEFAULT 0,
  failed_actions INTEGER DEFAULT 0,
  fraud_flags INTEGER DEFAULT 0,
  last_device_hash TEXT,
  known_device_hashes TEXT[] DEFAULT '{}',
  last_tier_change TIMESTAMPTZ,
  tier_change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Fraud Signals
CREATE TABLE IF NOT EXISTS public.pplp_fraud_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  signal_type TEXT NOT NULL,
  severity INTEGER DEFAULT 1,
  details JSONB DEFAULT '{}',
  source TEXT DEFAULT 'SYSTEM',
  is_resolved BOOLEAN DEFAULT false,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Device Registry
CREATE TABLE IF NOT EXISTS public.pplp_device_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_hash TEXT NOT NULL,
  user_id UUID NOT NULL,
  usage_count INTEGER DEFAULT 0,
  last_seen TIMESTAMPTZ DEFAULT now(),
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  UNIQUE(device_hash, user_id)
);

-- 11. Policies
CREATE TABLE IF NOT EXISTS public.pplp_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  policy_hash TEXT,
  thresholds JSONB,
  caps JSONB,
  formulas JSONB,
  action_configs JSONB,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. User Nonces (for EIP-712 replay protection)
CREATE TABLE IF NOT EXISTS public.pplp_user_nonces (
  user_id UUID PRIMARY KEY,
  current_nonce BIGINT DEFAULT 0,
  last_used_at TIMESTAMPTZ DEFAULT now()
);

-- 13. Epoch Caps (Global daily limits)
CREATE TABLE IF NOT EXISTS public.pplp_epoch_caps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch_date DATE NOT NULL,
  epoch_type TEXT DEFAULT 'daily',
  total_minted BIGINT DEFAULT 0,
  action_counts JSONB DEFAULT '{}',
  unique_users INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(epoch_date, epoch_type)
);

-- 14. Audits (Random audit selection)
CREATE TABLE IF NOT EXISTS public.pplp_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID REFERENCES public.pplp_actions(id),
  actor_id UUID NOT NULL,
  audit_type TEXT DEFAULT 'RANDOM',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- RLS Policies
-- =============================================

ALTER TABLE public.pplp_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fun_distribution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fun_pool_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_user_caps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_action_caps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_user_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_device_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_user_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_epoch_caps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_audits ENABLE ROW LEVEL SECURITY;

-- pplp_actions: Users see own, admins see all, service role can insert/update
CREATE POLICY "Users can view own actions" ON public.pplp_actions FOR SELECT USING (auth.uid() = actor_id);
CREATE POLICY "Admins can view all actions" ON public.pplp_actions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manages actions" ON public.pplp_actions FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_scores: Users see own scores, admins see all
CREATE POLICY "Users can view own scores" ON public.pplp_scores FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.pplp_actions WHERE id = pplp_scores.action_id AND actor_id = auth.uid())
);
CREATE POLICY "Admins can view all scores" ON public.pplp_scores FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manages scores" ON public.pplp_scores FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_evidences: Similar to scores
CREATE POLICY "Users can view own evidences" ON public.pplp_evidences FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.pplp_actions WHERE id = pplp_evidences.action_id AND actor_id = auth.uid())
);
CREATE POLICY "Service role manages evidences" ON public.pplp_evidences FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- fun_distribution_logs: Admins only + service role
CREATE POLICY "Admins can view distribution logs" ON public.fun_distribution_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manages distribution" ON public.fun_distribution_logs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- fun_pool_config: Admins can read, service role can manage
CREATE POLICY "Admins can view pool config" ON public.fun_pool_config FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manages pool config" ON public.fun_pool_config FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_user_caps: Users see own, service role manages
CREATE POLICY "Users can view own caps" ON public.pplp_user_caps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages caps" ON public.pplp_user_caps FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_action_caps: Anyone can read (public config)
CREATE POLICY "Anyone can view action caps" ON public.pplp_action_caps FOR SELECT USING (true);
CREATE POLICY "Service role manages action caps" ON public.pplp_action_caps FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_user_tiers: Users see own, admins see all
CREATE POLICY "Users can view own tier" ON public.pplp_user_tiers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all tiers" ON public.pplp_user_tiers FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manages tiers" ON public.pplp_user_tiers FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_fraud_signals: Admins only
CREATE POLICY "Admins can view fraud signals" ON public.pplp_fraud_signals FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manages fraud" ON public.pplp_fraud_signals FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_device_registry: Service role only
CREATE POLICY "Service role manages devices" ON public.pplp_device_registry FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_policies: Anyone can read active policy, service role manages
CREATE POLICY "Anyone can view active policy" ON public.pplp_policies FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can view all policies" ON public.pplp_policies FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manages policies" ON public.pplp_policies FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_user_nonces: Users see own, service role manages
CREATE POLICY "Users can view own nonce" ON public.pplp_user_nonces FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages nonces" ON public.pplp_user_nonces FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_epoch_caps: Anyone can read
CREATE POLICY "Anyone can view epoch caps" ON public.pplp_epoch_caps FOR SELECT USING (true);
CREATE POLICY "Service role manages epoch caps" ON public.pplp_epoch_caps FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- pplp_audits: Admins only
CREATE POLICY "Admins can view audits" ON public.pplp_audits FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manages audits" ON public.pplp_audits FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_pplp_actions_actor ON public.pplp_actions(actor_id);
CREATE INDEX IF NOT EXISTS idx_pplp_actions_status ON public.pplp_actions(status);
CREATE INDEX IF NOT EXISTS idx_pplp_actions_platform ON public.pplp_actions(platform_id);
CREATE INDEX IF NOT EXISTS idx_pplp_actions_created ON public.pplp_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pplp_scores_action ON public.pplp_scores(action_id);
CREATE INDEX IF NOT EXISTS idx_pplp_scores_decision ON public.pplp_scores(decision);
CREATE INDEX IF NOT EXISTS idx_pplp_user_caps_user_epoch ON public.pplp_user_caps(user_id, epoch_date);
CREATE INDEX IF NOT EXISTS idx_pplp_fraud_actor ON public.pplp_fraud_signals(actor_id);
CREATE INDEX IF NOT EXISTS idx_pplp_fraud_unresolved ON public.pplp_fraud_signals(is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_fun_dist_mint_req ON public.fun_distribution_logs(mint_request_id);

-- =============================================
-- Database Functions
-- =============================================

-- Get next nonce for EIP-712
CREATE OR REPLACE FUNCTION public.get_next_nonce(_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nonce BIGINT;
BEGIN
  INSERT INTO pplp_user_nonces (user_id, current_nonce, last_used_at)
  VALUES (_user_id, 1, now())
  ON CONFLICT (user_id) DO UPDATE SET
    current_nonce = pplp_user_nonces.current_nonce + 1,
    last_used_at = now()
  RETURNING current_nonce INTO v_nonce;
  RETURN v_nonce;
END;
$$;

-- Check user cap and update
CREATE OR REPLACE FUNCTION public.check_user_cap_and_update(
  _user_id UUID,
  _action_type TEXT,
  _reward_amount BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cap RECORD;
  v_user_cap RECORD;
  v_tier RECORD;
  v_current_count INTEGER;
  v_effective_cap INTEGER;
  v_diminished_reward BIGINT;
  v_allowed BOOLEAN := true;
  v_reason TEXT;
BEGIN
  -- Get action cap config
  SELECT * INTO v_cap FROM pplp_action_caps
  WHERE action_type = _action_type AND is_active = true
  LIMIT 1;

  -- Get user tier
  SELECT * INTO v_tier FROM pplp_user_tiers WHERE user_id = _user_id;

  -- Get or create today's user cap
  INSERT INTO pplp_user_caps (user_id, epoch_date, epoch_type)
  VALUES (_user_id, CURRENT_DATE, 'daily')
  ON CONFLICT (user_id, epoch_date, epoch_type) DO NOTHING;

  SELECT * INTO v_user_cap FROM pplp_user_caps
  WHERE user_id = _user_id AND epoch_date = CURRENT_DATE AND epoch_type = 'daily';

  -- Check daily action count
  v_current_count := COALESCE((v_user_cap.action_counts->>_action_type)::INTEGER, 0);

  IF v_cap.max_per_user_daily IS NOT NULL AND v_current_count >= v_cap.max_per_user_daily THEN
    v_allowed := false;
    v_reason := 'Daily action cap reached for ' || _action_type;
  END IF;

  -- Apply diminishing returns
  v_diminished_reward := _reward_amount;
  IF v_cap.diminishing_threshold IS NOT NULL AND v_current_count >= v_cap.diminishing_threshold THEN
    v_diminished_reward := (_reward_amount * POWER(COALESCE(v_cap.diminishing_factor, 0.8), v_current_count - v_cap.diminishing_threshold + 1))::BIGINT;
  END IF;

  -- Update counts if allowed
  IF v_allowed THEN
    UPDATE pplp_user_caps SET
      action_counts = COALESCE(action_counts, '{}'::jsonb) || jsonb_build_object(_action_type, v_current_count + 1),
      total_minted = total_minted + v_diminished_reward,
      last_action_at = now(),
      updated_at = now()
    WHERE user_id = _user_id AND epoch_date = CURRENT_DATE AND epoch_type = 'daily';
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'original_reward', _reward_amount,
    'effective_reward', v_diminished_reward,
    'action_count', v_current_count + 1,
    'reason', v_reason
  );
END;
$$;

-- Expire old mint requests
CREATE OR REPLACE FUNCTION public.expire_old_mint_requests_v2()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expired INTEGER;
BEGIN
  UPDATE pplp_actions SET status = 'expired'
  WHERE status = 'pending'
  AND created_at < now() - INTERVAL '7 days';

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$;
