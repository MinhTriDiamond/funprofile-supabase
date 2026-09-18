
-- =============================================================
-- IDENTITY + TRUST LAYER v1.0 — Foundation + Reputation
-- =============================================================

-- ENUMS
DO $$ BEGIN
  CREATE TYPE public.did_entity_type AS ENUM ('human','organization','ai_agent','validator','merchant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.did_level AS ENUM ('L0','L1','L2','L3','L4');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.did_status AS ENUM ('pending','basic','verified','trusted','restricted','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.trust_tier AS ENUM ('T0','T1','T2','T3','T4');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sybil_risk_level AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.identity_link_type AS ENUM ('wallet','social','device','organization','email','phone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.link_verification_state AS ENUM ('unverified','verified','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sbt_category AS ENUM ('identity','trust','contribution','credential','milestone','legacy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sbt_status AS ENUM ('active','frozen','revoked','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sbt_privacy AS ENUM ('public','permissioned','private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sbt_issuance_mode AS ENUM ('auto','semi_auto','governance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attestation_type AS ENUM ('peer_endorsement','mentor','recovery_guardian','witness');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================
-- 1. did_registry
-- =============================================================
CREATE TABLE IF NOT EXISTS public.did_registry (
  did_id text PRIMARY KEY,
  owner_user_id uuid NOT NULL UNIQUE,
  entity_type public.did_entity_type NOT NULL DEFAULT 'human',
  did_level public.did_level NOT NULL DEFAULT 'L0',
  status public.did_status NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_did_owner ON public.did_registry(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_did_level ON public.did_registry(did_level);

ALTER TABLE public.did_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "did_public_read" ON public.did_registry;
CREATE POLICY "did_public_read" ON public.did_registry FOR SELECT USING (true);

DROP POLICY IF EXISTS "did_admin_write" ON public.did_registry;
CREATE POLICY "did_admin_write" ON public.did_registry FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- 2. identity_links
-- =============================================================
CREATE TABLE IF NOT EXISTS public.identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  did_id text NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  link_type public.identity_link_type NOT NULL,
  link_value text NOT NULL,
  verification_state public.link_verification_state NOT NULL DEFAULT 'unverified',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  UNIQUE (did_id, link_type, link_value)
);
CREATE INDEX IF NOT EXISTS idx_links_did ON public.identity_links(did_id);
CREATE INDEX IF NOT EXISTS idx_links_value ON public.identity_links(link_value);

ALTER TABLE public.identity_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "links_owner_read" ON public.identity_links;
CREATE POLICY "links_owner_read" ON public.identity_links FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    EXISTS (SELECT 1 FROM public.did_registry d WHERE d.did_id = identity_links.did_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "links_admin_write" ON public.identity_links;
CREATE POLICY "links_admin_write" ON public.identity_links FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- 3. trust_profile
-- =============================================================
CREATE TABLE IF NOT EXISTS public.trust_profile (
  did_id text PRIMARY KEY REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  tc numeric(4,3) NOT NULL DEFAULT 0.500 CHECK (tc >= 0.30 AND tc <= 1.50),
  trust_tier public.trust_tier NOT NULL DEFAULT 'T0',
  verification_strength numeric(3,2) NOT NULL DEFAULT 0.20,
  behavior_stability numeric(3,2) NOT NULL DEFAULT 0.30,
  social_trust numeric(3,2) NOT NULL DEFAULT 0.20,
  onchain_credibility numeric(3,2) NOT NULL DEFAULT 0.20,
  historical_cleanliness numeric(3,2) NOT NULL DEFAULT 0.50,
  risk_factor numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (risk_factor >= 0.30 AND risk_factor <= 1.00),
  sybil_risk public.sybil_risk_level NOT NULL DEFAULT 'low',
  fraud_risk public.sybil_risk_level NOT NULL DEFAULT 'low',
  last_calculated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trust_tier ON public.trust_profile(trust_tier);
CREATE INDEX IF NOT EXISTS idx_trust_sybil ON public.trust_profile(sybil_risk);

ALTER TABLE public.trust_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trust_public_read" ON public.trust_profile;
CREATE POLICY "trust_public_read" ON public.trust_profile FOR SELECT USING (true);

DROP POLICY IF EXISTS "trust_admin_write" ON public.trust_profile;
CREATE POLICY "trust_admin_write" ON public.trust_profile FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- 4. attestation_log
-- =============================================================
CREATE TABLE IF NOT EXISTS public.attestation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_did text NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  to_did text NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  attestation_type public.attestation_type NOT NULL,
  weight numeric(3,2) NOT NULL DEFAULT 0.50 CHECK (weight >= 0 AND weight <= 1),
  evidence_ref text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_did <> to_did)
);
CREATE INDEX IF NOT EXISTS idx_att_to ON public.attestation_log(to_did);
CREATE INDEX IF NOT EXISTS idx_att_from ON public.attestation_log(from_did);

ALTER TABLE public.attestation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "att_party_read" ON public.attestation_log;
CREATE POLICY "att_party_read" ON public.attestation_log FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    EXISTS (SELECT 1 FROM public.did_registry d WHERE d.did_id IN (attestation_log.from_did, attestation_log.to_did) AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "att_admin_write" ON public.attestation_log;
CREATE POLICY "att_admin_write" ON public.attestation_log FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- 5. identity_events
-- =============================================================
CREATE TABLE IF NOT EXISTS public.identity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  did_id text NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_ref text,
  tc_delta numeric(4,3) NOT NULL DEFAULT 0,
  risk_delta numeric(3,2) NOT NULL DEFAULT 0,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evt_did ON public.identity_events(did_id, created_at DESC);

ALTER TABLE public.identity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evt_owner_read" ON public.identity_events;
CREATE POLICY "evt_owner_read" ON public.identity_events FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    EXISTS (SELECT 1 FROM public.did_registry d WHERE d.did_id = identity_events.did_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "evt_admin_write" ON public.identity_events;
CREATE POLICY "evt_admin_write" ON public.identity_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- 6. sbt_registry
-- =============================================================
CREATE TABLE IF NOT EXISTS public.sbt_registry (
  token_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  did_id text NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  sbt_category public.sbt_category NOT NULL,
  sbt_type text NOT NULL,
  issuer text NOT NULL DEFAULT 'system',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  status public.sbt_status NOT NULL DEFAULT 'active',
  evidence_hash text,
  trust_weight numeric(3,2) NOT NULL DEFAULT 0.10 CHECK (trust_weight >= 0 AND trust_weight <= 1),
  privacy_level public.sbt_privacy NOT NULL DEFAULT 'public',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  revocation_reason text,
  UNIQUE (did_id, sbt_type)
);
CREATE INDEX IF NOT EXISTS idx_sbt_did ON public.sbt_registry(did_id);
CREATE INDEX IF NOT EXISTS idx_sbt_cat ON public.sbt_registry(sbt_category, status);

ALTER TABLE public.sbt_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sbt_visibility_read" ON public.sbt_registry;
CREATE POLICY "sbt_visibility_read" ON public.sbt_registry FOR SELECT
  USING (
    privacy_level = 'public' OR
    public.has_role(auth.uid(), 'admin'::app_role) OR
    EXISTS (SELECT 1 FROM public.did_registry d WHERE d.did_id = sbt_registry.did_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "sbt_admin_write" ON public.sbt_registry;
CREATE POLICY "sbt_admin_write" ON public.sbt_registry FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger non-transferable: chặn đổi did_id
CREATE OR REPLACE FUNCTION public.sbt_enforce_non_transferable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.did_id <> OLD.did_id THEN
    RAISE EXCEPTION 'SBT is non-transferable: did_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sbt_non_transferable ON public.sbt_registry;
CREATE TRIGGER trg_sbt_non_transferable
  BEFORE UPDATE ON public.sbt_registry
  FOR EACH ROW EXECUTE FUNCTION public.sbt_enforce_non_transferable();

-- =============================================================
-- 7. sbt_issuance_rules
-- =============================================================
CREATE TABLE IF NOT EXISTS public.sbt_issuance_rules (
  sbt_type text PRIMARY KEY,
  category public.sbt_category NOT NULL,
  display_name text NOT NULL,
  description text,
  mode public.sbt_issuance_mode NOT NULL DEFAULT 'governance',
  auto_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  tc_impact numeric(3,2) NOT NULL DEFAULT 0.00,
  trust_weight numeric(3,2) NOT NULL DEFAULT 0.10,
  privacy_level public.sbt_privacy NOT NULL DEFAULT 'public',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sbt_issuance_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rules_public_read" ON public.sbt_issuance_rules;
CREATE POLICY "rules_public_read" ON public.sbt_issuance_rules FOR SELECT USING (true);

DROP POLICY IF EXISTS "rules_admin_write" ON public.sbt_issuance_rules;
CREATE POLICY "rules_admin_write" ON public.sbt_issuance_rules FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- 8. dib_profile
-- =============================================================
CREATE TABLE IF NOT EXISTS public.dib_profile (
  did_id text PRIMARY KEY REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  identity_vault_hash text,
  trust_vault_hash text,
  reputation_vault_hash text,
  contribution_vault_hash text,
  credential_vault_hash text,
  governance_vault_hash text,
  economic_access_hash text,
  last_snapshot_at timestamptz,
  snapshot_epoch text
);

ALTER TABLE public.dib_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dib_owner_read" ON public.dib_profile;
CREATE POLICY "dib_owner_read" ON public.dib_profile FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    EXISTS (SELECT 1 FROM public.did_registry d WHERE d.did_id = dib_profile.did_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "dib_admin_write" ON public.dib_profile;
CREATE POLICY "dib_admin_write" ON public.dib_profile FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- 9. identity_epoch_snapshots
-- =============================================================
CREATE TABLE IF NOT EXISTS public.identity_epoch_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  did_id text NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  epoch_id text NOT NULL,
  did_level public.did_level NOT NULL,
  tc numeric(4,3) NOT NULL,
  trust_tier public.trust_tier NOT NULL,
  sybil_risk public.sybil_risk_level NOT NULL,
  active_sbt_count int NOT NULL DEFAULT 0,
  dib_state_root_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (did_id, epoch_id)
);
CREATE INDEX IF NOT EXISTS idx_snap_epoch ON public.identity_epoch_snapshots(epoch_id);

ALTER TABLE public.identity_epoch_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snap_public_read" ON public.identity_epoch_snapshots;
CREATE POLICY "snap_public_read" ON public.identity_epoch_snapshots FOR SELECT USING (true);

DROP POLICY IF EXISTS "snap_admin_write" ON public.identity_epoch_snapshots;
CREATE POLICY "snap_admin_write" ON public.identity_epoch_snapshots FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- 10. identity_recovery_log
-- =============================================================
CREATE TABLE IF NOT EXISTS public.identity_recovery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  did_id text NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  method text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  cooldown_until timestamptz,
  freeze_mint_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recovery_did ON public.identity_recovery_log(did_id, created_at DESC);

ALTER TABLE public.identity_recovery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rec_owner_read" ON public.identity_recovery_log;
CREATE POLICY "rec_owner_read" ON public.identity_recovery_log FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    EXISTS (SELECT 1 FROM public.did_registry d WHERE d.did_id = identity_recovery_log.did_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "rec_admin_write" ON public.identity_recovery_log;
CREATE POLICY "rec_admin_write" ON public.identity_recovery_log FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- updated_at trigger for did_registry
-- =============================================================
DROP TRIGGER IF EXISTS trg_did_updated_at ON public.did_registry;
CREATE TRIGGER trg_did_updated_at
  BEFORE UPDATE ON public.did_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================
-- Auto-create DID + trust_profile + dib_profile on signup
-- =============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_did text;
BEGIN
  new_did := 'did:fun:' || NEW.id::text;

  INSERT INTO public.did_registry (did_id, owner_user_id, entity_type, did_level, status)
  VALUES (new_did, NEW.id, 'human', 'L0', 'pending')
  ON CONFLICT (owner_user_id) DO NOTHING;

  INSERT INTO public.trust_profile (did_id) VALUES (new_did)
  ON CONFLICT (did_id) DO NOTHING;

  INSERT INTO public.dib_profile (did_id) VALUES (new_did)
  ON CONFLICT (did_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_identity ON auth.users;
CREATE TRIGGER on_auth_user_created_identity
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_identity();

-- =============================================================
-- Backfill existing users
-- =============================================================
INSERT INTO public.did_registry (did_id, owner_user_id, entity_type, did_level, status)
SELECT 'did:fun:' || p.id::text, p.id, 'human', 'L0', 'basic'
FROM public.profiles p
ON CONFLICT (owner_user_id) DO NOTHING;

INSERT INTO public.trust_profile (did_id)
SELECT did_id FROM public.did_registry
ON CONFLICT (did_id) DO NOTHING;

INSERT INTO public.dib_profile (did_id)
SELECT did_id FROM public.did_registry
ON CONFLICT (did_id) DO NOTHING;

-- =============================================================
-- Seed SBT issuance rules (9 rules)
-- =============================================================
INSERT INTO public.sbt_issuance_rules (sbt_type, category, display_name, description, mode, auto_conditions, tc_impact, trust_weight, privacy_level) VALUES
  ('verified_human','identity','Verified Human','Đã xác minh là người thật qua DID L2+','auto','{"min_did_level":"L2"}'::jsonb, 0.10, 0.20, 'public'),
  ('clean_history','trust','Clean History','90 ngày không bị flag','auto','{"min_clean_days":90}'::jsonb, 0.05, 0.15, 'public'),
  ('anti_sybil_passed','trust','Anti-Sybil Passed','Sybil risk = low liên tục 30 ngày','auto','{"max_sybil":"low","min_days":30}'::jsonb, 0.05, 0.15, 'public'),
  ('builder','contribution','Builder','Đóng góp xây dựng đã được duyệt','semi_auto','{"min_accepted":5}'::jsonb, 0.05, 0.15, 'public'),
  ('mentor_certified','contribution','Mentor Certified','Đã được governance phê duyệt làm mentor','governance','{}'::jsonb, 0.10, 0.20, 'public'),
  ('learning_path_complete','credential','Learning Path Complete','Hoàn thành lộ trình học','auto','{"course_completed":true}'::jsonb, 0.02, 0.10, 'public'),
  ('100_day_consistency','milestone','100-Day Consistency','Streak liên tục 100 ngày','auto','{"min_streak_days":100}'::jsonb, 0.05, 0.15, 'public'),
  ('first_proposal_adopted','milestone','First Proposal Adopted','Đề xuất đầu tiên được áp dụng','auto','{"proposal_status":"adopted"}'::jsonb, 0.10, 0.20, 'public'),
  ('foundational_builder','legacy','Foundational Builder','Builder nền móng — di sản hệ sinh thái','governance','{}'::jsonb, 0.15, 0.30, 'public')
ON CONFLICT (sbt_type) DO NOTHING;

-- =============================================================
-- Migrate existing soul_nfts → SBT verified_human
-- =============================================================
INSERT INTO public.sbt_registry (did_id, sbt_category, sbt_type, issuer, issued_at, status, trust_weight, privacy_level, metadata)
SELECT
  d.did_id,
  'identity'::sbt_category,
  'verified_human',
  'system',
  COALESCE(s.minted_at, now()),
  'active'::sbt_status,
  0.20,
  'public'::sbt_privacy,
  jsonb_build_object('migrated_from','soul_nfts','soul_nft_id', s.id)
FROM public.soul_nfts s
JOIN public.did_registry d ON d.owner_user_id = s.user_id
WHERE s.is_minted = true
ON CONFLICT (did_id, sbt_type) DO NOTHING;
