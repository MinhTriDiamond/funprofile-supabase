-- ============================================================
-- 1. ORG_PROFILE (tạo trước)
-- ============================================================
CREATE TABLE public.org_profile (
  did_id text PRIMARY KEY REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  display_name text NOT NULL,
  legal_name text,
  domain text,
  website text,
  description text,
  logo_url text,
  org_type text NOT NULL DEFAULT 'general' CHECK (org_type IN ('general','dao','company','nonprofit','validator_pool','partner')),
  domain_verified boolean NOT NULL DEFAULT false,
  domain_verified_at timestamptz,
  member_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_profile ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_org_profile_domain ON public.org_profile(domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_org_profile_type ON public.org_profile(org_type);

-- ============================================================
-- 2. ORG_MEMBERS
-- ============================================================
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_did_id text NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  member_did_id text NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','observer')),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended','removed')),
  invited_by text REFERENCES public.did_registry(did_id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(org_did_id, member_did_id)
);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_org_members_org ON public.org_members(org_did_id);
CREATE INDEX idx_org_members_member ON public.org_members(member_did_id);

-- ============================================================
-- HELPER FUNCTION (sau khi bảng đã tồn tại)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_org_admin(_did_id text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members om
    JOIN public.did_registry dr ON dr.did_id = om.member_did_id
    WHERE om.org_did_id = _did_id
      AND dr.owner_user_id = _user_id
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
  )
$$;

-- ============================================================
-- POLICIES cho org_profile
-- ============================================================
CREATE POLICY "Org profiles are public"
  ON public.org_profile FOR SELECT USING (true);

CREATE POLICY "Org owner can update profile"
  ON public.org_profile FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.did_registry dr
    WHERE dr.did_id = org_profile.did_id AND dr.owner_user_id = auth.uid()
  ));

CREATE POLICY "Service role full access org_profile"
  ON public.org_profile FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- POLICIES cho org_members
-- ============================================================
CREATE POLICY "Org members visible to all"
  ON public.org_members FOR SELECT USING (true);

CREATE POLICY "Org admin manage members"
  ON public.org_members FOR ALL
  USING (public.is_org_admin(org_did_id, auth.uid()));

CREATE POLICY "Service role full access org_members"
  ON public.org_members FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 3. VALIDATOR_PROFILE
-- ============================================================
CREATE TABLE public.validator_profile (
  did_id text PRIMARY KEY REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  display_name text NOT NULL,
  description text,
  website text,
  contact_email text,
  stake_amount numeric NOT NULL DEFAULT 0 CHECK (stake_amount >= 0),
  min_stake_required numeric NOT NULL DEFAULT 1000,
  uptime_pct numeric NOT NULL DEFAULT 100 CHECK (uptime_pct >= 0 AND uptime_pct <= 100),
  slash_count integer NOT NULL DEFAULT 0,
  last_slash_at timestamptz,
  total_validations integer NOT NULL DEFAULT 0,
  successful_validations integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','jailed','exited','slashed')),
  stake_started_at timestamptz,
  exited_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.validator_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Validator profiles are public"
  ON public.validator_profile FOR SELECT USING (true);

CREATE POLICY "Admin manage validators"
  ON public.validator_profile FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access validator_profile"
  ON public.validator_profile FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE INDEX idx_validator_status ON public.validator_profile(status);
CREATE INDEX idx_validator_stake ON public.validator_profile(stake_amount DESC);

-- ============================================================
-- 4. AI_AGENT_PROFILE
-- ============================================================
CREATE TABLE public.ai_agent_profile (
  did_id text PRIMARY KEY REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  display_name text NOT NULL,
  operator_did_id text NOT NULL REFERENCES public.did_registry(did_id),
  organization_did_id text REFERENCES public.did_registry(did_id),
  description text,
  model_name text,
  model_version text,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  autonomy_level text NOT NULL DEFAULT 'supervised' CHECK (autonomy_level IN ('supervised','semi_autonomous','autonomous')),
  audit_log_url text,
  api_endpoint text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','revoked')),
  last_action_at timestamptz,
  total_actions integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agent_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AI agent profiles are public"
  ON public.ai_agent_profile FOR SELECT USING (true);

CREATE POLICY "Operator can update AI agent"
  ON public.ai_agent_profile FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.did_registry dr
    WHERE dr.did_id = ai_agent_profile.operator_did_id
      AND dr.owner_user_id = auth.uid()
  ));

CREATE POLICY "Operator can insert AI agent"
  ON public.ai_agent_profile FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.did_registry dr
    WHERE dr.did_id = ai_agent_profile.operator_did_id
      AND dr.owner_user_id = auth.uid()
  ));

CREATE POLICY "Service role full access ai_agent_profile"
  ON public.ai_agent_profile FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE INDEX idx_ai_agent_operator ON public.ai_agent_profile(operator_did_id);
CREATE INDEX idx_ai_agent_org ON public.ai_agent_profile(organization_did_id) WHERE organization_did_id IS NOT NULL;
CREATE INDEX idx_ai_agent_status ON public.ai_agent_profile(status);

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================
CREATE TRIGGER trg_org_profile_updated
  BEFORE UPDATE ON public.org_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_validator_profile_updated
  BEFORE UPDATE ON public.validator_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_ai_agent_profile_updated
  BEFORE UPDATE ON public.ai_agent_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TRIGGER: maintain member_count on org_profile
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_org_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE public.org_profile SET member_count = member_count + 1 WHERE did_id = NEW.org_did_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
    UPDATE public.org_profile SET member_count = GREATEST(0, member_count - 1) WHERE did_id = OLD.org_did_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND NEW.status != 'active' THEN
      UPDATE public.org_profile SET member_count = GREATEST(0, member_count - 1) WHERE did_id = NEW.org_did_id;
    ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
      UPDATE public.org_profile SET member_count = member_count + 1 WHERE did_id = NEW.org_did_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_org_member_count
  AFTER INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_org_member_count();

-- ============================================================
-- TRIGGER: validator slash → write identity_event
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_validator_slash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.slash_count > OLD.slash_count THEN
    INSERT INTO public.identity_events (did_id, event_type, event_ref, tc_delta, risk_delta, source, metadata)
    VALUES (
      NEW.did_id, 'validator_slashed', NEW.did_id,
      -0.10, 0.15, 'validator_engine',
      jsonb_build_object('new_slash_count', NEW.slash_count, 'stake_amount', NEW.stake_amount)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validator_slash_event
  AFTER UPDATE ON public.validator_profile
  FOR EACH ROW EXECUTE FUNCTION public.log_validator_slash();