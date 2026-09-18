
-- =============================================
-- PPLP v2 — Truth Validation Engine
-- 6 tables + RLS + triggers + seed data
-- =============================================

-- 1. pplp_v2_action_types (seed 5 action categories)
CREATE TABLE public.pplp_v2_action_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  description TEXT,
  description_vi TEXT,
  icon TEXT,
  pillar_weights JSONB NOT NULL DEFAULT '{}',
  base_impact_score NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pplp_v2_action_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read action types"
  ON public.pplp_v2_action_types FOR SELECT
  USING (true);

-- 2. pplp_v2_user_actions (user submissions)
CREATE TABLE public.pplp_v2_user_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type_code TEXT NOT NULL REFERENCES public.pplp_v2_action_types(code),
  title TEXT NOT NULL,
  description TEXT,
  source_platform TEXT DEFAULT 'fun_profile',
  source_url TEXT,
  raw_metadata JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'proof_pending'
    CHECK (status IN ('proof_pending','under_review','validated','rejected','minted','flagged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pplp_v2_user_actions_user ON public.pplp_v2_user_actions(user_id);
CREATE INDEX idx_pplp_v2_user_actions_status ON public.pplp_v2_user_actions(status);

ALTER TABLE public.pplp_v2_user_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own actions"
  ON public.pplp_v2_user_actions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create own actions"
  ON public.pplp_v2_user_actions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own actions"
  ON public.pplp_v2_user_actions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

-- 3. pplp_v2_proofs (evidence attachments)
CREATE TABLE public.pplp_v2_proofs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_id UUID NOT NULL REFERENCES public.pplp_v2_user_actions(id) ON DELETE CASCADE,
  proof_type TEXT NOT NULL DEFAULT 'link'
    CHECK (proof_type IN ('link','video','image','onchain_tx','system_log','manual_attestation')),
  proof_url TEXT,
  file_hash TEXT,
  external_ref TEXT,
  extracted_text TEXT,
  raw_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_pplp_v2_proofs_file_hash 
  ON public.pplp_v2_proofs(file_hash) WHERE file_hash IS NOT NULL;

CREATE INDEX idx_pplp_v2_proofs_action ON public.pplp_v2_proofs(action_id);

ALTER TABLE public.pplp_v2_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view proofs of own actions"
  ON public.pplp_v2_proofs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pplp_v2_user_actions a 
    WHERE a.id = action_id AND a.user_id = auth.uid()
  ));

CREATE POLICY "Users can attach proofs to own actions"
  ON public.pplp_v2_proofs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pplp_v2_user_actions a 
    WHERE a.id = action_id AND a.user_id = auth.uid()
  ));

-- 4. pplp_v2_validations (5 pillars scoring)
CREATE TABLE public.pplp_v2_validations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_id UUID NOT NULL REFERENCES public.pplp_v2_user_actions(id) ON DELETE CASCADE,
  -- 5 Pillars (0-10 each)
  serving_life NUMERIC(5,2) NOT NULL DEFAULT 0,
  transparent_truth NUMERIC(5,2) NOT NULL DEFAULT 0,
  healing_love NUMERIC(5,2) NOT NULL DEFAULT 0,
  long_term_value NUMERIC(5,2) NOT NULL DEFAULT 0,
  unity_over_separation NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- Weighted component scores
  ai_score NUMERIC(5,2) DEFAULT 0,
  community_score NUMERIC(5,2) DEFAULT 5.0,
  trust_signal_score NUMERIC(5,2) DEFAULT 5.0,
  -- Final scores
  raw_light_score NUMERIC(10,4) DEFAULT 0,
  final_light_score NUMERIC(10,4) DEFAULT 0,
  confidence NUMERIC(3,2) DEFAULT 0,
  -- AI reasoning
  explanation JSONB DEFAULT '{}',
  flags JSONB DEFAULT '[]',
  -- Status
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending','validated','rejected','manual_review')),
  validated_at TIMESTAMPTZ,
  validator_type TEXT DEFAULT 'ai' CHECK (validator_type IN ('ai','community','admin','system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pplp_v2_validations_action ON public.pplp_v2_validations(action_id);

ALTER TABLE public.pplp_v2_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view validations of own actions"
  ON public.pplp_v2_validations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pplp_v2_user_actions a 
    WHERE a.id = action_id AND a.user_id = auth.uid()
  ));

-- 5. pplp_v2_mint_records (99/1 split ledger)
CREATE TABLE public.pplp_v2_mint_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_id UUID NOT NULL REFERENCES public.pplp_v2_user_actions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  light_score NUMERIC(10,4) NOT NULL DEFAULT 0,
  base_mint_rate NUMERIC(10,2) NOT NULL DEFAULT 10,
  mint_amount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  mint_amount_user NUMERIC(12,2) NOT NULL DEFAULT 0,
  mint_amount_platform NUMERIC(12,2) NOT NULL DEFAULT 0,
  release_mode TEXT NOT NULL DEFAULT 'instant' CHECK (release_mode IN ('instant','locked')),
  claimable_now NUMERIC(12,2) DEFAULT 0,
  locked_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','minted','failed')),
  minted_at TIMESTAMPTZ,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pplp_v2_mint_records_user ON public.pplp_v2_mint_records(user_id);
CREATE INDEX idx_pplp_v2_mint_records_action ON public.pplp_v2_mint_records(action_id);

ALTER TABLE public.pplp_v2_mint_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mint records"
  ON public.pplp_v2_mint_records FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- 6. pplp_v2_immutable_rules (cannot be modified or deleted)
CREATE TABLE public.pplp_v2_immutable_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  rule_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pplp_v2_immutable_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read immutable rules"
  ON public.pplp_v2_immutable_rules FOR SELECT
  USING (true);

-- Trigger to prevent UPDATE/DELETE on immutable_rules
CREATE OR REPLACE FUNCTION public.prevent_immutable_rules_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PPLP immutable rules cannot be modified or deleted. This is by design.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_prevent_immutable_rules_update
  BEFORE UPDATE ON public.pplp_v2_immutable_rules
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_rules_modification();

CREATE TRIGGER trg_prevent_immutable_rules_delete
  BEFORE DELETE ON public.pplp_v2_immutable_rules
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_rules_modification();

-- Updated_at trigger for tables that need it
CREATE OR REPLACE FUNCTION public.pplp_v2_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_pplp_v2_action_types_updated
  BEFORE UPDATE ON public.pplp_v2_action_types
  FOR EACH ROW EXECUTE FUNCTION public.pplp_v2_update_updated_at();

CREATE TRIGGER trg_pplp_v2_user_actions_updated
  BEFORE UPDATE ON public.pplp_v2_user_actions
  FOR EACH ROW EXECUTE FUNCTION public.pplp_v2_update_updated_at();

CREATE TRIGGER trg_pplp_v2_validations_updated
  BEFORE UPDATE ON public.pplp_v2_validations
  FOR EACH ROW EXECUTE FUNCTION public.pplp_v2_update_updated_at();

-- =============================================
-- SEED DATA
-- =============================================

-- Seed 5 action types
INSERT INTO public.pplp_v2_action_types (code, name, name_vi, description_vi, icon, pillar_weights, base_impact_score) VALUES
('INNER_WORK', 'Inner Work', 'Thiền / Sám hối / Nội tâm', 'Hành động tu tập nội tâm: thiền định, sám hối, tĩnh lặng', '🧘', '{"serving_life": 0.10, "transparent_truth": 0.30, "healing_love": 0.30, "long_term_value": 0.15, "unity_over_separation": 0.15}', 0.8),
('CHANNELING', 'Channeling / Sharing', 'Dẫn kênh / Chia sẻ', 'Chia sẻ kiến thức, truyền cảm hứng, dẫn kênh năng lượng', '📡', '{"serving_life": 0.15, "transparent_truth": 0.25, "healing_love": 0.20, "long_term_value": 0.20, "unity_over_separation": 0.20}', 1.0),
('GIVING', 'Giving', 'Cho đi', 'Tặng quà, quyên góp, chia sẻ tài nguyên', '🎁', '{"serving_life": 0.30, "transparent_truth": 0.15, "healing_love": 0.25, "long_term_value": 0.15, "unity_over_separation": 0.15}', 1.2),
('SOCIAL_IMPACT', 'Social Impact', 'Tác động xã hội', 'Hoạt động thiện nguyện, dự án cộng đồng, giáo dục', '🌍', '{"serving_life": 0.25, "transparent_truth": 0.20, "healing_love": 0.15, "long_term_value": 0.25, "unity_over_separation": 0.15}', 1.2),
('SERVICE', 'Service', 'Phụng sự sự sống', 'Phụng sự trực tiếp: giúp đỡ người khác, chăm sóc môi trường', '🙏', '{"serving_life": 0.30, "transparent_truth": 0.15, "healing_love": 0.20, "long_term_value": 0.15, "unity_over_separation": 0.20}', 1.3);

-- Seed immutable rules
INSERT INTO public.pplp_v2_immutable_rules (rule_code, rule_name, rule_value, description) VALUES
('PPLP_DEFINITION', 'PPLP Definition', 'Proof of Pure Love Protocol', 'The one and only definition. No other interpretation allowed.'),
('MINT_SPLIT', 'Mint Distribution', '99% User / 1% Platform', 'Fixed tokenomic split. No investors, no funds, no whales.'),
('NO_PROOF_NO_SCORE', 'No Proof No Score', 'Actions without proof receive Light Score = 0', 'Mandatory evidence requirement for all scored actions.'),
('NO_SCORE_NO_MINT', 'No Score No Mint', 'Actions with Light Score = 0 cannot generate FUN Money', 'Zero score means zero mint. No exceptions.');
