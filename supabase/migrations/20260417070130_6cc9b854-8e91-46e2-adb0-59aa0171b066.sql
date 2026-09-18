
-- ============================================
-- Phase 3 Identity Layer: Recovery + Dispute
-- ============================================

-- 1. identity_guardians: trusted guardian cho recovery
CREATE TABLE public.identity_guardians (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  did_id TEXT NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  guardian_did_id TEXT NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'friend',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT identity_guardians_no_self CHECK (did_id <> guardian_did_id),
  CONSTRAINT identity_guardians_status_check CHECK (status IN ('pending', 'active', 'revoked', 'declined')),
  CONSTRAINT identity_guardians_unique UNIQUE (did_id, guardian_did_id)
);

CREATE INDEX idx_guardians_did ON public.identity_guardians(did_id) WHERE status = 'active';
CREATE INDEX idx_guardians_guardian ON public.identity_guardians(guardian_did_id) WHERE status IN ('pending','active');

-- Trigger: max 5 active guardian/user
CREATE OR REPLACE FUNCTION public.check_guardian_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF (SELECT COUNT(*) FROM public.identity_guardians WHERE did_id = NEW.did_id AND status = 'active' AND id <> NEW.id) >= 5 THEN
      RAISE EXCEPTION 'Tối đa 5 guardian active mỗi tài khoản';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guardian_limit BEFORE INSERT OR UPDATE ON public.identity_guardians
FOR EACH ROW EXECUTE FUNCTION public.check_guardian_limit();

ALTER TABLE public.identity_guardians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner views own guardians" ON public.identity_guardians
FOR SELECT USING (
  did_id IN (SELECT did_id FROM public.did_registry WHERE owner_user_id = auth.uid())
);
CREATE POLICY "Guardian sees own invitations" ON public.identity_guardians
FOR SELECT USING (
  guardian_did_id IN (SELECT did_id FROM public.did_registry WHERE owner_user_id = auth.uid())
);
CREATE POLICY "Owner inserts guardian" ON public.identity_guardians
FOR INSERT WITH CHECK (
  did_id IN (SELECT did_id FROM public.did_registry WHERE owner_user_id = auth.uid())
);
CREATE POLICY "Owner updates own guardian" ON public.identity_guardians
FOR UPDATE USING (
  did_id IN (SELECT did_id FROM public.did_registry WHERE owner_user_id = auth.uid())
);
CREATE POLICY "Guardian accepts/declines invitation" ON public.identity_guardians
FOR UPDATE USING (
  guardian_did_id IN (SELECT did_id FROM public.did_registry WHERE owner_user_id = auth.uid())
) WITH CHECK (
  guardian_did_id IN (SELECT did_id FROM public.did_registry WHERE owner_user_id = auth.uid())
);
CREATE POLICY "Admin views all guardians" ON public.identity_guardians
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- 2. identity_disputes: appeal SBT/sybil/penalty
-- ============================================
CREATE TYPE public.dispute_type AS ENUM ('sbt_revoke', 'sbt_freeze', 'sybil_flag', 'trust_penalty', 'did_demotion');
CREATE TYPE public.dispute_status AS ENUM ('pending', 'under_review', 'accepted', 'rejected', 'withdrawn');

CREATE TABLE public.identity_disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  did_id TEXT NOT NULL REFERENCES public.did_registry(did_id) ON DELETE CASCADE,
  dispute_type public.dispute_type NOT NULL,
  target_ref TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.dispute_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_disputes_did ON public.identity_disputes(did_id);
CREATE INDEX idx_disputes_status ON public.identity_disputes(status) WHERE status IN ('pending','under_review');
CREATE INDEX idx_disputes_target ON public.identity_disputes(dispute_type, target_ref);

CREATE TRIGGER trg_disputes_updated_at BEFORE UPDATE ON public.identity_disputes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.identity_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User views own disputes" ON public.identity_disputes
FOR SELECT USING (
  did_id IN (SELECT did_id FROM public.did_registry WHERE owner_user_id = auth.uid())
);
CREATE POLICY "User submits own dispute" ON public.identity_disputes
FOR INSERT WITH CHECK (
  did_id IN (SELECT did_id FROM public.did_registry WHERE owner_user_id = auth.uid())
);
CREATE POLICY "User withdraws own dispute" ON public.identity_disputes
FOR UPDATE USING (
  did_id IN (SELECT did_id FROM public.did_registry WHERE owner_user_id = auth.uid()) AND status = 'pending'
) WITH CHECK (status = 'withdrawn');
CREATE POLICY "Admin views all disputes" ON public.identity_disputes
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin resolves dispute" ON public.identity_disputes
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- 3. Helper: get DID id của current user
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_did()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT did_id FROM public.did_registry WHERE owner_user_id = auth.uid() LIMIT 1;
$$;
