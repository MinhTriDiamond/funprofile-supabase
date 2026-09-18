
-- 1. tx_validation_snapshots --------------------------------------------------
CREATE TABLE public.tx_validation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL,
  ran_by UUID,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  from_ts TIMESTAMPTZ,
  to_ts TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('pass','warning','failed')),
  legacy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  unified_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  diff_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_txvs_user ON public.tx_validation_snapshots(target_user_id, ran_at DESC);
CREATE INDEX idx_txvs_status ON public.tx_validation_snapshots(status, ran_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tx_validation_snapshots TO authenticated;
GRANT ALL ON public.tx_validation_snapshots TO service_role;

ALTER TABLE public.tx_validation_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage validation snapshots"
  ON public.tx_validation_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2. tx_shadow_diffs ----------------------------------------------------------
CREATE TABLE public.tx_shadow_diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  surface TEXT NOT NULL,
  diff_type TEXT NOT NULL,
  legacy_count INT,
  unified_count INT,
  legacy_sum NUMERIC,
  unified_sum NUMERIC,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_txsd_surface ON public.tx_shadow_diffs(surface, created_at DESC);
CREATE INDEX idx_txsd_user ON public.tx_shadow_diffs(user_id, created_at DESC);
CREATE INDEX idx_txsd_type ON public.tx_shadow_diffs(diff_type, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tx_shadow_diffs TO authenticated;
GRANT ALL ON public.tx_shadow_diffs TO service_role;

ALTER TABLE public.tx_shadow_diffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own shadow diff"
  ON public.tx_shadow_diffs FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Admin read shadow diffs"
  ON public.tx_shadow_diffs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admin manage shadow diffs"
  ON public.tx_shadow_diffs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 3. tx_perf_samples ----------------------------------------------------------
CREATE TABLE public.tx_perf_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  surface TEXT NOT NULL,
  op TEXT NOT NULL,
  ms NUMERIC NOT NULL,
  payload_bytes INT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_txps_op ON public.tx_perf_samples(op, created_at DESC);
CREATE INDEX idx_txps_surface ON public.tx_perf_samples(surface, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tx_perf_samples TO authenticated;
GRANT ALL ON public.tx_perf_samples TO service_role;

ALTER TABLE public.tx_perf_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own perf sample"
  ON public.tx_perf_samples FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Admin read perf samples"
  ON public.tx_perf_samples FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admin delete perf samples"
  ON public.tx_perf_samples FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 4. app_settings flags (default OFF) ----------------------------------------
INSERT INTO public.app_settings(key, value)
VALUES
  ('unified_shadow_sampling', '0'::jsonb),
  ('unified_validation_ui_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
