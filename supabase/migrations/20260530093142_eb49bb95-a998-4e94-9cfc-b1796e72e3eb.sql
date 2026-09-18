
-- ============================================================
-- 1. identity_levels
-- ============================================================
CREATE TABLE public.identity_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'sumsub',
  level_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  tier_hint TEXT,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, level_name)
);

GRANT SELECT ON public.identity_levels TO anon, authenticated;
GRANT ALL ON public.identity_levels TO service_role;

ALTER TABLE public.identity_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "identity_levels_public_read"
  ON public.identity_levels FOR SELECT
  USING (true);

INSERT INTO public.identity_levels (provider, level_name, display_name, tier_hint, description)
VALUES
  ('sumsub', 'basic-kyc-level', 'KYC cơ bản', 'T2', 'Xác minh giấy tờ tùy thân + selfie cơ bản'),
  ('sumsub', 'enhanced-kyc-level', 'KYC nâng cao', 'T3', 'KYC cơ bản + xác minh địa chỉ'),
  ('sumsub', 'institutional-level', 'KYC tổ chức', 'T4', 'Xác minh doanh nghiệp / tổ chức');

-- ============================================================
-- 2. identity_verifications (SOURCE OF TRUTH)
-- ============================================================
CREATE TABLE public.identity_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'sumsub',
  provider_applicant_id TEXT,
  external_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_review','approved','rejected','expired')),
  level_name TEXT,
  country TEXT,
  review_result_summary JSONB,
  verified_at TIMESTAMPTZ,
  rejected_reason TEXT,
  source_platform TEXT NOT NULL DEFAULT 'fun-profile',
  is_test_verification BOOLEAN NOT NULL DEFAULT FALSE,
  verification_environment TEXT NOT NULL DEFAULT 'sandbox'
    CHECK (verification_environment IN ('sandbox','production')),
  future_core_identity_id TEXT,
  migrated_to_core BOOLEAN NOT NULL DEFAULT FALSE,
  sync_status TEXT NOT NULL DEFAULT 'local_only'
    CHECK (sync_status IN ('local_only','synced_to_core','sync_failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX idx_identity_verifications_user ON public.identity_verifications(user_id);
CREATE INDEX idx_identity_verifications_applicant ON public.identity_verifications(provider, provider_applicant_id);
CREATE INDEX idx_identity_verifications_status ON public.identity_verifications(status);

GRANT SELECT ON public.identity_verifications TO authenticated;
GRANT ALL ON public.identity_verifications TO service_role;

ALTER TABLE public.identity_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "identity_verifications_own_read"
  ON public.identity_verifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_identity_verifications_updated_at
  BEFORE UPDATE ON public.identity_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. identity_verification_events (webhook idempotency + audit)
-- ============================================================
CREATE TABLE public.identity_verification_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identity_verification_id UUID REFERENCES public.identity_verifications(id) ON DELETE SET NULL,
  user_id UUID,
  provider TEXT NOT NULL DEFAULT 'sumsub',
  provider_applicant_id TEXT,
  external_user_id TEXT,
  provider_event_id TEXT,
  webhook_event_hash TEXT NOT NULL,
  event_type TEXT,
  status TEXT,
  review_status TEXT,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  trace_id TEXT,
  source_platform TEXT NOT NULL DEFAULT 'fun-profile',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','ignored_duplicate','failed','frozen_skipped')),
  error_message TEXT,
  metadata_summary JSONB,
  UNIQUE (provider, webhook_event_hash)
);

CREATE INDEX idx_ive_user ON public.identity_verification_events(user_id);
CREATE INDEX idx_ive_applicant ON public.identity_verification_events(provider, provider_applicant_id);
CREATE INDEX idx_ive_received ON public.identity_verification_events(received_at DESC);

GRANT ALL ON public.identity_verification_events TO service_role;

ALTER TABLE public.identity_verification_events ENABLE ROW LEVEL SECURITY;

-- (no policy = no access for non-service_role; backend-only)

-- ============================================================
-- 4. kyc_test_users
-- ============================================================
CREATE TABLE public.kyc_test_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  username TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  added_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.kyc_test_users TO service_role;

ALTER TABLE public.kyc_test_users ENABLE ROW LEVEL SECURITY;

-- Admin can read for management UI later (Phase 1.5)
CREATE POLICY "kyc_test_users_admin_read"
  ON public.kyc_test_users FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_kyc_test_users_updated_at
  BEFORE UPDATE ON public.kyc_test_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. identity_kyc_metrics
-- ============================================================
CREATE TABLE public.identity_kyc_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'sumsub',
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_applicants INT NOT NULL DEFAULT 0,
  approved INT NOT NULL DEFAULT 0,
  rejected INT NOT NULL DEFAULT 0,
  pending INT NOT NULL DEFAULT 0,
  in_review INT NOT NULL DEFAULT 0,
  expired INT NOT NULL DEFAULT 0,
  duplicate_webhooks INT NOT NULL DEFAULT 0,
  invalid_signatures INT NOT NULL DEFAULT 0,
  frozen_skipped INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, metric_date)
);

GRANT SELECT ON public.identity_kyc_metrics TO authenticated;
GRANT ALL ON public.identity_kyc_metrics TO service_role;

ALTER TABLE public.identity_kyc_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "identity_kyc_metrics_admin_read"
  ON public.identity_kyc_metrics FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_identity_kyc_metrics_updated_at
  BEFORE UPDATE ON public.identity_kyc_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: atomic increment counter
CREATE OR REPLACE FUNCTION public.kyc_metrics_increment(
  _provider TEXT,
  _field TEXT,
  _delta INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed TEXT[] := ARRAY['total_applicants','approved','rejected','pending','in_review','expired','duplicate_webhooks','invalid_signatures','frozen_skipped'];
BEGIN
  IF NOT (_field = ANY(_allowed)) THEN
    RAISE EXCEPTION 'kyc_metrics_increment: invalid field %', _field;
  END IF;

  INSERT INTO public.identity_kyc_metrics (provider, metric_date)
  VALUES (_provider, CURRENT_DATE)
  ON CONFLICT (provider, metric_date) DO NOTHING;

  EXECUTE format(
    'UPDATE public.identity_kyc_metrics SET %I = %I + $1, updated_at = now() WHERE provider = $2 AND metric_date = CURRENT_DATE',
    _field, _field
  ) USING _delta, _provider;
END;
$$;

-- ============================================================
-- 6. profiles cache columns
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_level TEXT;

COMMENT ON COLUMN public.profiles.identity_verified IS 'CACHE only. Source of truth: identity_verifications.status = approved';
COMMENT ON COLUMN public.profiles.identity_verified_at IS 'CACHE only. Source: identity_verifications.verified_at';
COMMENT ON COLUMN public.profiles.identity_level IS 'CACHE only. Source: identity_verifications.level_name';

-- ============================================================
-- 7. Feature flags
-- ============================================================
INSERT INTO public.system_config (key, value, description) VALUES
  ('sumsub_kyc_enabled', 'false', 'Public KYC switch — false = chưa mở đại trà'),
  ('sumsub_kyc_test_mode', 'true', 'Test channel — chỉ user trong kyc_test_users dùng được'),
  ('sumsub_kyc_freeze', 'false', 'Freeze — true = không tạo applicant/token mới, webhook vẫn xử lý hồ sơ dang dở')
ON CONFLICT (key) DO NOTHING;
