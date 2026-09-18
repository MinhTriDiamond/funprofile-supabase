
-- 1) Extend event_type CHECK
ALTER TABLE public.fun_profile_event_outbox
  DROP CONSTRAINT IF EXISTS fun_profile_event_outbox_event_type_check;

ALTER TABLE public.fun_profile_event_outbox
  ADD CONSTRAINT fun_profile_event_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'PLATFORM_USER_CREATED',
    'PROFILE_UPDATED',
    'DID_PROMOTED',
    'TRUST_UPDATED',
    'SBT_ISSUED',
    'SBT_REVOKED',
    'WALLET_LINKED',
    'WALLET_UNLINKED'
  ]));

-- 2) Kill-switch + per-event flags
INSERT INTO public.app_settings(key, value) VALUES
  ('federation_outbox_producer_enabled', to_jsonb(false))
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings(key, value) VALUES
  ('federation_outbox_event_flags', jsonb_build_object(
    'PROFILE_UPDATED', true,
    'DID_PROMOTED', true,
    'TRUST_UPDATED', true,
    'SBT_ISSUED', true,
    'SBT_REVOKED', true,
    'WALLET_LINKED', true,
    'WALLET_UNLINKED', true
  ))
ON CONFLICT (key) DO NOTHING;

-- 3) Helper: emit event into outbox (gated by kill-switch unless p_force=true)
CREATE OR REPLACE FUNCTION public._emit_fp_event(
  p_event_type text,
  p_aggregate_id text,
  p_payload jsonb,
  p_force boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_flags jsonb;
  v_event_on boolean;
  v_trace text;
  v_idem text;
  v_payload_canonical text;
  v_id uuid;
BEGIN
  -- Kill-switch
  IF NOT p_force THEN
    SELECT (value)::boolean INTO v_enabled
      FROM public.app_settings WHERE key = 'federation_outbox_producer_enabled';
    IF COALESCE(v_enabled, false) = false THEN
      RETURN NULL;
    END IF;

    SELECT value INTO v_flags
      FROM public.app_settings WHERE key = 'federation_outbox_event_flags';
    v_event_on := COALESCE((v_flags ->> p_event_type)::boolean, true);
    IF v_event_on = false THEN
      RETURN NULL;
    END IF;
  END IF;

  IF p_aggregate_id IS NULL OR length(p_aggregate_id) = 0 THEN
    RETURN NULL;
  END IF;

  -- Canonicalize payload via jsonb sort (textual)
  v_payload_canonical := COALESCE(p_payload::text, '{}');
  v_idem := 'fun-profile:' || p_event_type || ':' || p_aggregate_id || ':' ||
            encode(digest(v_payload_canonical, 'sha256'), 'hex');
  v_trace := 'fp-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.fun_profile_event_outbox(
    event_type, aggregate_type, aggregate_id, payload,
    status, attempts, trace_id, idempotency_key, next_attempt_at
  ) VALUES (
    p_event_type, 'platform_user', p_aggregate_id,
    COALESCE(p_payload, '{}'::jsonb),
    'pending', 0, v_trace, v_idem, now()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public._emit_fp_event(text, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._emit_fp_event(text, text, jsonb, boolean) TO service_role;

-- 4) Trigger: profiles -> PROFILE_UPDATED (whitelist fields only, only on diff)
CREATE OR REPLACE FUNCTION public.trg_emit_profile_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_changed boolean := false;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN v_changed := true; END IF;
  IF NEW.username IS DISTINCT FROM OLD.username THEN v_changed := true; END IF;
  IF NEW.bio IS DISTINCT FROM OLD.bio THEN v_changed := true; END IF;
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN v_changed := true; END IF;
  IF NEW.cover_url IS DISTINCT FROM OLD.cover_url THEN v_changed := true; END IF;
  IF NEW.preferred_language IS DISTINCT FROM OLD.preferred_language THEN v_changed := true; END IF;

  IF NOT v_changed THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'platform_slug', 'fun-profile',
    'origin_platform', 'fun-profile',
    'platform_user_id', NEW.id::text,
    'display_name', NEW.display_name,
    'username', NEW.username,
    'bio', NEW.bio,
    'avatar_url', NEW.avatar_url,
    'cover_url', NEW.cover_url,
    'preferred_language', NEW.preferred_language,
    'updated_at', NEW.updated_at
  );

  PERFORM public._emit_fp_event('PROFILE_UPDATED', NEW.id::text, v_payload, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_profile_updated ON public.profiles;
CREATE TRIGGER trg_outbox_profile_updated
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_profile_updated();

-- 5) Trigger: did_registry -> DID_PROMOTED (only when level increases)
CREATE OR REPLACE FUNCTION public.trg_emit_did_promoted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.did_level, 0) <= COALESCE(OLD.did_level, 0) THEN RETURN NEW; END IF;
  IF NEW.owner_user_id IS NULL THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'platform_slug', 'fun-profile',
    'origin_platform', 'fun-profile',
    'platform_user_id', NEW.owner_user_id::text,
    'did_id', NEW.did_id,
    'entity_type', NEW.entity_type,
    'from_level', OLD.did_level,
    'to_level', NEW.did_level,
    'status', NEW.status,
    'promoted_at', NEW.updated_at
  );

  PERFORM public._emit_fp_event('DID_PROMOTED', NEW.owner_user_id::text, v_payload, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_did_promoted ON public.did_registry;
CREATE TRIGGER trg_outbox_did_promoted
AFTER UPDATE ON public.did_registry
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_did_promoted();

-- 6) Trigger: trust_profile -> TRUST_UPDATED (tc or trust_tier change)
CREATE OR REPLACE FUNCTION public.trg_emit_trust_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_payload jsonb;
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.tc IS NOT DISTINCT FROM OLD.tc
       AND NEW.trust_tier IS NOT DISTINCT FROM OLD.trust_tier THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT owner_user_id INTO v_user_id
    FROM public.did_registry WHERE did_id = NEW.did_id LIMIT 1;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'platform_slug', 'fun-profile',
    'origin_platform', 'fun-profile',
    'platform_user_id', v_user_id::text,
    'did_id', NEW.did_id,
    'tc_score', NEW.tc,
    'tier', NEW.trust_tier,
    'updated_at', NEW.last_calculated_at
  );

  PERFORM public._emit_fp_event('TRUST_UPDATED', v_user_id::text, v_payload, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_trust_updated ON public.trust_profile;
CREATE TRIGGER trg_outbox_trust_updated
AFTER INSERT OR UPDATE ON public.trust_profile
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_trust_updated();

-- 7) Trigger: sbt_registry -> SBT_ISSUED / SBT_REVOKED
CREATE OR REPLACE FUNCTION public.trg_emit_sbt_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_payload jsonb;
  v_did text;
  v_event text;
  v_safe_meta jsonb;
BEGIN
  v_did := COALESCE(NEW.did_id, OLD.did_id);
  SELECT owner_user_id INTO v_user_id
    FROM public.did_registry WHERE did_id = v_did LIMIT 1;
  IF v_user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event := 'SBT_ISSUED';
  ELSIF TG_OP = 'DELETE' THEN
    v_event := 'SBT_REVOKED';
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'revoked' AND COALESCE(OLD.status,'') <> 'revoked' THEN
    v_event := 'SBT_REVOKED';
  ELSE
    RETURN NEW;
  END IF;

  -- Strip sensitive raw metadata; keep only safe public keys if present
  v_safe_meta := jsonb_build_object();
  IF TG_OP <> 'DELETE' AND NEW.metadata IS NOT NULL THEN
    v_safe_meta := jsonb_build_object(
      'title', NEW.metadata -> 'title',
      'description', NEW.metadata -> 'description',
      'category', NEW.metadata -> 'category'
    );
  END IF;

  v_payload := jsonb_build_object(
    'platform_slug', 'fun-profile',
    'origin_platform', 'fun-profile',
    'platform_user_id', v_user_id::text,
    'did_id', v_did,
    'token_id', COALESCE(NEW.token_id, OLD.token_id),
    'sbt_category', COALESCE(NEW.sbt_category, OLD.sbt_category),
    'sbt_type', COALESCE(NEW.sbt_type, OLD.sbt_type),
    'issuer', COALESCE(NEW.issuer, OLD.issuer),
    'issued_at', COALESCE(NEW.issued_at, OLD.issued_at),
    'expires_at', COALESCE(NEW.expires_at, OLD.expires_at),
    'status', COALESCE(NEW.status, OLD.status),
    'trust_weight', COALESCE(NEW.trust_weight, OLD.trust_weight),
    'privacy_level', COALESCE(NEW.privacy_level, OLD.privacy_level),
    'evidence_hash', COALESCE(NEW.evidence_hash, OLD.evidence_hash),
    'revocation_reason', CASE WHEN v_event='SBT_REVOKED' THEN COALESCE(NEW.revocation_reason, OLD.revocation_reason) ELSE NULL END,
    'metadata_safe', v_safe_meta
  );

  PERFORM public._emit_fp_event(v_event, v_user_id::text, v_payload, false);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_sbt_change ON public.sbt_registry;
CREATE TRIGGER trg_outbox_sbt_change
AFTER INSERT OR UPDATE OR DELETE ON public.sbt_registry
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_sbt_change();

-- 8) Trigger: custodial_wallets -> WALLET_LINKED / WALLET_UNLINKED
CREATE OR REPLACE FUNCTION public.trg_emit_wallet_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_payload jsonb;
  v_user uuid;
  v_addr text;
  v_chain int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_active, true) = false THEN RETURN NEW; END IF;
    v_event := 'WALLET_LINKED';
    v_user := NEW.user_id; v_addr := NEW.wallet_address; v_chain := NEW.chain_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      v_event := CASE WHEN NEW.is_active THEN 'WALLET_LINKED' ELSE 'WALLET_UNLINKED' END;
      v_user := NEW.user_id; v_addr := NEW.wallet_address; v_chain := NEW.chain_id;
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_event := 'WALLET_UNLINKED';
    v_user := OLD.user_id; v_addr := OLD.wallet_address; v_chain := OLD.chain_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_user IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  v_payload := jsonb_build_object(
    'platform_slug', 'fun-profile',
    'origin_platform', 'fun-profile',
    'platform_user_id', v_user::text,
    'wallet_address', lower(v_addr),
    'wallet_address_hash', encode(digest(lower(v_addr), 'sha256'), 'hex'),
    'chain_id', v_chain,
    'wallet_status', CASE WHEN v_event='WALLET_LINKED' THEN 'active' ELSE 'inactive' END,
    'wallet_kind', 'custodial'
  );

  PERFORM public._emit_fp_event(v_event, v_user::text, v_payload, false);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_wallet_change ON public.custodial_wallets;
CREATE TRIGGER trg_outbox_wallet_change
AFTER INSERT OR UPDATE OR DELETE ON public.custodial_wallets
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_wallet_change();

-- 9) Admin RPC: toggle producer
CREATE OR REPLACE FUNCTION public.fun_profile_toggle_outbox_producer(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO public.app_settings(key, value)
  VALUES ('federation_outbox_producer_enabled', to_jsonb(p_enabled))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.audit_logs(action, actor_id, target_type, target_id, metadata)
  VALUES ('federation_outbox_producer_toggle', auth.uid(), 'app_settings',
          'federation_outbox_producer_enabled',
          jsonb_build_object('enabled', p_enabled));

  RETURN jsonb_build_object('ok', true, 'enabled', p_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.fun_profile_toggle_outbox_producer(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fun_profile_toggle_outbox_producer(boolean) TO authenticated;

-- 10) Admin RPC: dry-run emit single event for one user (bypass kill-switch)
CREATE OR REPLACE FUNCTION public.fun_profile_dry_run_emit_event(
  p_user_id uuid,
  p_event_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_did record;
  v_trust record;
  v_profile record;
  v_wallet record;
  v_sbt record;
  v_outbox_id uuid;
  v_aggregate text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_aggregate := p_user_id::text;

  IF p_event_type = 'PROFILE_UPDATED' THEN
    SELECT id, display_name, username, bio, avatar_url, cover_url, preferred_language, updated_at
      INTO v_profile FROM public.profiles WHERE id = p_user_id;
    IF v_profile.id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
    v_payload := jsonb_build_object(
      'platform_slug','fun-profile','origin_platform','fun-profile',
      'platform_user_id', v_profile.id::text,
      'display_name', v_profile.display_name,
      'username', v_profile.username,
      'bio', v_profile.bio,
      'avatar_url', v_profile.avatar_url,
      'cover_url', v_profile.cover_url,
      'preferred_language', v_profile.preferred_language,
      'updated_at', v_profile.updated_at,
      'dry_run', true,
      'nonce', gen_random_uuid()
    );

  ELSIF p_event_type = 'DID_PROMOTED' THEN
    SELECT did_id, entity_type, did_level, status, updated_at
      INTO v_did FROM public.did_registry WHERE owner_user_id = p_user_id ORDER BY did_level DESC LIMIT 1;
    IF v_did.did_id IS NULL THEN RAISE EXCEPTION 'did not found'; END IF;
    v_payload := jsonb_build_object(
      'platform_slug','fun-profile','origin_platform','fun-profile',
      'platform_user_id', v_aggregate,
      'did_id', v_did.did_id, 'entity_type', v_did.entity_type,
      'from_level', GREATEST(0, COALESCE(v_did.did_level,0)-1),
      'to_level', v_did.did_level, 'status', v_did.status,
      'promoted_at', v_did.updated_at,
      'dry_run', true, 'nonce', gen_random_uuid()
    );

  ELSIF p_event_type = 'TRUST_UPDATED' THEN
    SELECT t.did_id, t.tc, t.trust_tier, t.last_calculated_at
      INTO v_trust FROM public.trust_profile t
      JOIN public.did_registry d ON d.did_id = t.did_id
      WHERE d.owner_user_id = p_user_id LIMIT 1;
    IF v_trust.did_id IS NULL THEN RAISE EXCEPTION 'trust not found'; END IF;
    v_payload := jsonb_build_object(
      'platform_slug','fun-profile','origin_platform','fun-profile',
      'platform_user_id', v_aggregate,
      'did_id', v_trust.did_id, 'tc_score', v_trust.tc,
      'tier', v_trust.trust_tier, 'updated_at', v_trust.last_calculated_at,
      'dry_run', true, 'nonce', gen_random_uuid()
    );

  ELSIF p_event_type IN ('SBT_ISSUED','SBT_REVOKED') THEN
    SELECT s.* INTO v_sbt FROM public.sbt_registry s
      JOIN public.did_registry d ON d.did_id = s.did_id
      WHERE d.owner_user_id = p_user_id ORDER BY s.issued_at DESC LIMIT 1;
    IF v_sbt.token_id IS NULL THEN RAISE EXCEPTION 'sbt not found'; END IF;
    v_payload := jsonb_build_object(
      'platform_slug','fun-profile','origin_platform','fun-profile',
      'platform_user_id', v_aggregate,
      'did_id', v_sbt.did_id, 'token_id', v_sbt.token_id,
      'sbt_category', v_sbt.sbt_category, 'sbt_type', v_sbt.sbt_type,
      'issuer', v_sbt.issuer, 'issued_at', v_sbt.issued_at,
      'expires_at', v_sbt.expires_at, 'status', v_sbt.status,
      'trust_weight', v_sbt.trust_weight, 'privacy_level', v_sbt.privacy_level,
      'evidence_hash', v_sbt.evidence_hash,
      'metadata_safe', jsonb_build_object(
        'title', v_sbt.metadata->'title',
        'description', v_sbt.metadata->'description',
        'category', v_sbt.metadata->'category'
      ),
      'dry_run', true, 'nonce', gen_random_uuid()
    );

  ELSIF p_event_type IN ('WALLET_LINKED','WALLET_UNLINKED') THEN
    SELECT user_id, wallet_address, chain_id, is_active
      INTO v_wallet FROM public.custodial_wallets WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 1;
    IF v_wallet.user_id IS NULL THEN RAISE EXCEPTION 'wallet not found'; END IF;
    v_payload := jsonb_build_object(
      'platform_slug','fun-profile','origin_platform','fun-profile',
      'platform_user_id', v_aggregate,
      'wallet_address', lower(v_wallet.wallet_address),
      'wallet_address_hash', encode(digest(lower(v_wallet.wallet_address), 'sha256'), 'hex'),
      'chain_id', v_wallet.chain_id,
      'wallet_status', CASE WHEN p_event_type='WALLET_LINKED' THEN 'active' ELSE 'inactive' END,
      'wallet_kind', 'custodial',
      'dry_run', true, 'nonce', gen_random_uuid()
    );

  ELSE
    RAISE EXCEPTION 'unsupported event_type: %', p_event_type;
  END IF;

  v_outbox_id := public._emit_fp_event(p_event_type, v_aggregate, v_payload, true);

  INSERT INTO public.audit_logs(action, actor_id, target_type, target_id, metadata)
  VALUES ('federation_outbox_dry_run', auth.uid(), 'fun_profile_event_outbox',
          COALESCE(v_outbox_id::text, 'duplicate'),
          jsonb_build_object('event_type', p_event_type, 'target_user', p_user_id));

  RETURN jsonb_build_object(
    'ok', true,
    'outbox_id', v_outbox_id,
    'event_type', p_event_type,
    'aggregate_id', v_aggregate,
    'payload', v_payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fun_profile_dry_run_emit_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fun_profile_dry_run_emit_event(uuid, text) TO authenticated;
