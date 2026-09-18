-- =============================================
-- PHASE 1: Monetary Foundation
-- =============================================

-- Mở rộng mint_epochs
ALTER TABLE public.mint_epochs
  ADD COLUMN IF NOT EXISTS base_expansion numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contribution_expansion numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ecosystem_expansion numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discipline_modulator numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS final_mint numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_stage text DEFAULT 'bootstrap',
  ADD COLUMN IF NOT EXISTS soft_ceiling numeric DEFAULT 5000000,
  ADD COLUMN IF NOT EXISTS verified_light_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_contribution_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ecosystem_usage_index numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_quality_users integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allocation_breakdown jsonb DEFAULT '{}'::jsonb;

-- Mở rộng mint_allocations
ALTER TABLE public.mint_allocations
  ADD COLUMN IF NOT EXISTS instant_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trust_band text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS vesting_schedule_id uuid,
  ADD COLUMN IF NOT EXISTS consistency_factor numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS utility_factor numeric DEFAULT 1.0;

-- Bảng cấu hình epoch
CREATE TABLE IF NOT EXISTS public.epoch_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text UNIQUE NOT NULL,
  system_stage text NOT NULL DEFAULT 'bootstrap',
  base_rate numeric NOT NULL DEFAULT 500000,
  alpha numeric NOT NULL DEFAULT 100,
  beta numeric NOT NULL DEFAULT 80,
  gamma numeric NOT NULL DEFAULT 60,
  delta numeric NOT NULL DEFAULT 50,
  epsilon numeric NOT NULL DEFAULT 40,
  zeta numeric NOT NULL DEFAULT 30,
  soft_ceiling numeric NOT NULL DEFAULT 5000000,
  min_epoch_mint numeric NOT NULL DEFAULT 100000,
  modulator_min numeric NOT NULL DEFAULT 0.65,
  modulator_max numeric NOT NULL DEFAULT 1.25,
  user_pool_pct numeric NOT NULL DEFAULT 0.70,
  ecosystem_pool_pct numeric NOT NULL DEFAULT 0.12,
  treasury_pool_pct numeric NOT NULL DEFAULT 0.10,
  strategic_pool_pct numeric NOT NULL DEFAULT 0.05,
  resilience_pool_pct numeric NOT NULL DEFAULT 0.03,
  instant_portion_pct numeric NOT NULL DEFAULT 0.15,
  locked_portion_pct numeric NOT NULL DEFAULT 0.85,
  base_vesting_days integer NOT NULL DEFAULT 28,
  unlock_check_interval_days integer NOT NULL DEFAULT 7,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.epoch_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage epoch config"
  ON public.epoch_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active epoch config"
  ON public.epoch_config FOR SELECT TO authenticated
  USING (is_active = true);

-- Bảng metrics theo kỳ epoch
CREATE TABLE IF NOT EXISTS public.epoch_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch_id uuid REFERENCES public.mint_epochs(id) ON DELETE CASCADE,
  epoch_label text NOT NULL,
  verified_light_score numeric DEFAULT 0,
  verified_contribution_value numeric DEFAULT 0,
  service_impact_score numeric DEFAULT 0,
  ecosystem_usage_index numeric DEFAULT 0,
  active_quality_users integer DEFAULT 0,
  utility_diversity_index numeric DEFAULT 0,
  liquidity_discipline_index numeric DEFAULT 1.0,
  fraud_pressure_index numeric DEFAULT 0,
  claim_efficiency_index numeric DEFAULT 1.0,
  utility_retention_index numeric DEFAULT 1.0,
  raw_total_mint numeric DEFAULT 0,
  adjusted_mint numeric DEFAULT 0,
  final_mint numeric DEFAULT 0,
  computed_at timestamptz DEFAULT now()
);

ALTER TABLE public.epoch_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage epoch metrics"
  ON public.epoch_metrics FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view epoch metrics"
  ON public.epoch_metrics FOR SELECT TO authenticated
  USING (true);

-- Bảng inflation health
CREATE TABLE IF NOT EXISTS public.inflation_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measured_at timestamptz NOT NULL DEFAULT now(),
  value_expansion_ratio numeric DEFAULT 0,
  utility_absorption_ratio numeric DEFAULT 0,
  retention_quality_ratio numeric DEFAULT 0,
  fraud_pressure_ratio numeric DEFAULT 0,
  locked_stability_ratio numeric DEFAULT 0,
  total_supply numeric DEFAULT 0,
  circulating_supply numeric DEFAULT 0,
  locked_supply numeric DEFAULT 0,
  safe_mode text DEFAULT 'normal',
  alerts jsonb DEFAULT '[]'::jsonb,
  notes text
);

ALTER TABLE public.inflation_health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage inflation health"
  ON public.inflation_health_metrics FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- PHASE 2: Lock/Unlock System
-- =============================================

CREATE TABLE IF NOT EXISTS public.reward_vesting_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  allocation_id uuid,
  epoch_id uuid REFERENCES public.mint_epochs(id) ON DELETE SET NULL,
  total_amount numeric NOT NULL,
  instant_amount numeric NOT NULL DEFAULT 0,
  locked_amount numeric NOT NULL DEFAULT 0,
  released_amount numeric NOT NULL DEFAULT 0,
  remaining_locked numeric NOT NULL DEFAULT 0,
  release_at timestamptz NOT NULL,
  next_unlock_check_at timestamptz,
  unlock_history jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  trust_band text DEFAULT 'standard',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vesting_user ON public.reward_vesting_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_vesting_status ON public.reward_vesting_schedules(status);
CREATE INDEX IF NOT EXISTS idx_vesting_release_at ON public.reward_vesting_schedules(release_at);

ALTER TABLE public.reward_vesting_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own vesting schedules"
  ON public.reward_vesting_schedules FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage vesting schedules"
  ON public.reward_vesting_schedules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- PHASE 3: Epoch Layers + Anti-Farm
-- =============================================

CREATE TABLE IF NOT EXISTS public.user_epoch_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  epoch_id uuid REFERENCES public.mint_epochs(id) ON DELETE CASCADE,
  epoch_label text NOT NULL,
  window_type text NOT NULL DEFAULT 'mint',
  preview_score numeric DEFAULT 0,
  validated_score numeric DEFAULT 0,
  finalized_score numeric DEFAULT 0,
  raw_activity_count integer DEFAULT 0,
  deduped_activity_count integer DEFAULT 0,
  active_days integer DEFAULT 0,
  total_window_days integer DEFAULT 28,
  consistency_factor numeric DEFAULT 1.0,
  burst_penalty_factor numeric DEFAULT 1.0,
  trust_ramp_factor numeric DEFAULT 1.0,
  cross_window_continuity_factor numeric DEFAULT 1.0,
  late_window_suppression_factor numeric DEFAULT 1.0,
  trust_factor numeric DEFAULT 1.0,
  fraud_factor numeric DEFAULT 0,
  utility_participation_factor numeric DEFAULT 1.0,
  weighted_score numeric DEFAULT 0,
  computed_at timestamptz DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE (user_id, epoch_label, window_type)
);

CREATE INDEX IF NOT EXISTS idx_user_epoch_scores_user ON public.user_epoch_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_epoch_scores_epoch ON public.user_epoch_scores(epoch_label);

ALTER TABLE public.user_epoch_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own epoch scores"
  ON public.user_epoch_scores FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage epoch scores"
  ON public.user_epoch_scores FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- PHASE 4: Treasury Recycle + Health
-- =============================================

CREATE TABLE IF NOT EXISTS public.treasury_vaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_key text UNIQUE NOT NULL,
  vault_name text NOT NULL,
  description text,
  balance numeric NOT NULL DEFAULT 0,
  total_inflow numeric NOT NULL DEFAULT 0,
  total_outflow numeric NOT NULL DEFAULT 0,
  allocation_pct numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.treasury_vaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view treasury vaults"
  ON public.treasury_vaults FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage treasury vaults"
  ON public.treasury_vaults FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.treasury_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type text NOT NULL,
  source text,
  destination_vault text,
  amount numeric NOT NULL,
  reason text,
  reference_table text,
  reference_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_flows_vault ON public.treasury_flows(destination_vault);
CREATE INDEX IF NOT EXISTS idx_treasury_flows_created ON public.treasury_flows(created_at);

ALTER TABLE public.treasury_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view treasury flows"
  ON public.treasury_flows FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage treasury flows"
  ON public.treasury_flows FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Triggers updated_at
CREATE TRIGGER trg_epoch_config_updated
  BEFORE UPDATE ON public.epoch_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_vesting_updated
  BEFORE UPDATE ON public.reward_vesting_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_treasury_vaults_updated
  BEFORE UPDATE ON public.treasury_vaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed dữ liệu mặc định
INSERT INTO public.epoch_config (config_key, system_stage, base_rate, soft_ceiling)
VALUES ('default', 'bootstrap', 500000, 5000000)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.treasury_vaults (vault_key, vault_name, description, allocation_pct) VALUES
  ('reward_reserve', 'Reward Reserve Vault', 'Bổ sung cho reward pool tương lai', 0.30),
  ('infrastructure', 'Infrastructure Vault', 'Backend, A.I., cloud, moderation, data infra', 0.25),
  ('community_growth', 'Community Growth Vault', 'Hỗ trợ community, contributor programs, training', 0.20),
  ('stability', 'Stability Vault', 'Đệm ổn định khi hệ có biến động hành vi', 0.15),
  ('strategic_expansion', 'Strategic Expansion Vault', 'Platform mới, đối tác mới, growth campaigns', 0.10)
ON CONFLICT (vault_key) DO NOTHING;