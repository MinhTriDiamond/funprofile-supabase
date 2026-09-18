
-- ============================================================
-- PPLP v2.5 — Light Score Engine
-- ============================================================

-- 1. VVU Log
CREATE TABLE IF NOT EXISTS public.pplp_v25_vvu_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  vvu_type TEXT NOT NULL DEFAULT 'personal',
  base_value NUMERIC NOT NULL DEFAULT 0,
  quality_score NUMERIC NOT NULL DEFAULT 1.0,
  trust_context NUMERIC NOT NULL DEFAULT 1.0,
  iis_value NUMERIC NOT NULL DEFAULT 1.0,
  im_value NUMERIC NOT NULL DEFAULT 1.0,
  anti_abuse_factor NUMERIC NOT NULL DEFAULT 1.0,
  erp_factor NUMERIC NOT NULL DEFAULT 1.0,
  vvu_value NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_v25_vvu_user ON public.pplp_v25_vvu_log(user_id);
CREATE INDEX IF NOT EXISTS idx_v25_vvu_source ON public.pplp_v25_vvu_log(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_v25_vvu_computed ON public.pplp_v25_vvu_log(computed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_v25_vvu_source ON public.pplp_v25_vvu_log(source_table, source_id, vvu_type);
ALTER TABLE public.pplp_v25_vvu_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v25_vvu_select" ON public.pplp_v25_vvu_log FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "v25_vvu_service" ON public.pplp_v25_vvu_log FOR ALL
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 2. Intent Metrics (IIS)
CREATE TABLE IF NOT EXISTS public.pplp_v25_intent_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  consistency_score NUMERIC NOT NULL DEFAULT 1.0,
  farm_ratio NUMERIC NOT NULL DEFAULT 0.0,
  manipulation_score NUMERIC NOT NULL DEFAULT 0.0,
  purity_bonus NUMERIC NOT NULL DEFAULT 0.0,
  iis_value NUMERIC NOT NULL DEFAULT 1.0 CHECK (iis_value >= 0 AND iis_value <= 1.5),
  computed_window_days INT NOT NULL DEFAULT 30,
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_v25_intent_iis ON public.pplp_v25_intent_metrics(iis_value DESC);
ALTER TABLE public.pplp_v25_intent_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v25_intent_select" ON public.pplp_v25_intent_metrics FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "v25_intent_service" ON public.pplp_v25_intent_metrics FOR ALL
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 3. Impact Metrics (IM)
CREATE TABLE IF NOT EXISTS public.pplp_v25_impact_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_table TEXT,
  source_id UUID,
  helped_users_count INT NOT NULL DEFAULT 0,
  retention_lift NUMERIC NOT NULL DEFAULT 0.0,
  knowledge_value NUMERIC NOT NULL DEFAULT 0.0,
  referral_quality NUMERIC NOT NULL DEFAULT 0.0,
  im_value NUMERIC NOT NULL DEFAULT 1.0 CHECK (im_value >= 0 AND im_value <= 3.0),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_v25_impact_user ON public.pplp_v25_impact_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_v25_impact_source ON public.pplp_v25_impact_metrics(source_table, source_id);
ALTER TABLE public.pplp_v25_impact_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v25_impact_select" ON public.pplp_v25_impact_metrics FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "v25_impact_service" ON public.pplp_v25_impact_metrics FOR ALL
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 4. Light Scores (3 tầng)
CREATE TABLE IF NOT EXISTS public.pplp_v25_light_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  epoch_label TEXT,
  pls NUMERIC NOT NULL DEFAULT 0,
  nls NUMERIC NOT NULL DEFAULT 0,
  lls NUMERIC NOT NULL DEFAULT 0,
  tls NUMERIC NOT NULL DEFAULT 0,
  raw_ls NUMERIC NOT NULL DEFAULT 0,
  display_ls NUMERIC NOT NULL DEFAULT 0,
  consistency_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  reliability_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  alpha NUMERIC NOT NULL DEFAULT 0.4,
  beta NUMERIC NOT NULL DEFAULT 0.3,
  gamma NUMERIC NOT NULL DEFAULT 0.3,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_v25_ls_user ON public.pplp_v25_light_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_v25_ls_current ON public.pplp_v25_light_scores(user_id, is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_v25_ls_tls ON public.pplp_v25_light_scores(tls DESC) WHERE is_current = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_v25_ls_current ON public.pplp_v25_light_scores(user_id) WHERE is_current = true;
ALTER TABLE public.pplp_v25_light_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v25_ls_select" ON public.pplp_v25_light_scores FOR SELECT
USING (is_current = true OR auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "v25_ls_service" ON public.pplp_v25_light_scores FOR ALL
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 5. Tier Assignments
CREATE TABLE IF NOT EXISTS public.pplp_v25_tier_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tier_name TEXT NOT NULL,
  tier_level INT NOT NULL DEFAULT 0,
  tier_multiplier NUMERIC NOT NULL DEFAULT 0.5,
  raw_ls_at_assignment NUMERIC NOT NULL DEFAULT 0,
  is_current BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_v25_tier_user ON public.pplp_v25_tier_assignments(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_v25_tier_current ON public.pplp_v25_tier_assignments(user_id) WHERE is_current = true;
ALTER TABLE public.pplp_v25_tier_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v25_tier_select" ON public.pplp_v25_tier_assignments FOR SELECT
USING (is_current = true OR auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "v25_tier_service" ON public.pplp_v25_tier_assignments FOR ALL
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 6. Config
CREATE TABLE IF NOT EXISTS public.pplp_v25_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE DEFAULT 'default',
  alpha NUMERIC NOT NULL DEFAULT 0.4,
  beta NUMERIC NOT NULL DEFAULT 0.3,
  gamma NUMERIC NOT NULL DEFAULT 0.3,
  tier_thresholds JSONB NOT NULL DEFAULT '{
    "Seed Light": 0,
    "Pure Light": 100,
    "Guiding Light": 500,
    "Radiant Light": 2000,
    "Legacy Light": 10000,
    "Cosmic Light": 50000
  }'::jsonb,
  tier_multipliers JSONB NOT NULL DEFAULT '{
    "Seed Light": 0.5,
    "Pure Light": 1.0,
    "Guiding Light": 1.5,
    "Radiant Light": 2.0,
    "Legacy Light": 3.0,
    "Cosmic Light": 5.0
  }'::jsonb,
  iis_min NUMERIC NOT NULL DEFAULT 0.0,
  iis_max NUMERIC NOT NULL DEFAULT 1.5,
  im_min NUMERIC NOT NULL DEFAULT 0.0,
  im_max NUMERIC NOT NULL DEFAULT 3.0,
  display_compression TEXT NOT NULL DEFAULT 'log',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pplp_v25_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v25_cfg_read" ON public.pplp_v25_config FOR SELECT USING (true);
CREATE POLICY "v25_cfg_admin" ON public.pplp_v25_config FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.pplp_v25_config (config_key, alpha, beta, gamma)
VALUES ('default', 0.4, 0.3, 0.3)
ON CONFLICT (config_key) DO NOTHING;

-- 7. Mở rộng profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS light_tier TEXT DEFAULT 'Seed Light',
  ADD COLUMN IF NOT EXISTS display_light_score NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_light_score NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iis_value NUMERIC DEFAULT 1.0;

CREATE INDEX IF NOT EXISTS idx_profiles_raw_ls ON public.profiles(raw_light_score DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_tier ON public.profiles(light_tier);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_v25_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_v25_intent_updated ON public.pplp_v25_intent_metrics;
CREATE TRIGGER trg_v25_intent_updated BEFORE UPDATE ON public.pplp_v25_intent_metrics
FOR EACH ROW EXECUTE FUNCTION public.update_v25_updated_at();

DROP TRIGGER IF EXISTS trg_v25_config_updated ON public.pplp_v25_config;
CREATE TRIGGER trg_v25_config_updated BEFORE UPDATE ON public.pplp_v25_config
FOR EACH ROW EXECUTE FUNCTION public.update_v25_updated_at();
