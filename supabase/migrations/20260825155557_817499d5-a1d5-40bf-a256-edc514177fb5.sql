-- ════════════════════════════════════════════════════════════════════════════
-- BTC Attribution Resolver — Phase 1 + Phase 2 (bản sửa 4 điểm CTO 25/08/2026)
-- Điểm 1: resolve_btc_owner CHỈ service_role EXECUTE (bỏ anon + authenticated).
-- Điểm 2: notifications_type_check = UNION danh sách ĐANG CÓ trên DB + 1 type mới.
-- Điểm 3: notify có dedup 24h/admin.
-- Điểm 4: btc_address_ownership_history chỉ service_role đọc/ghi.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.btc_normalize_address(p_address text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_address ~* '^bc1[a-z0-9]+$' THEN lower(btrim(p_address))
    ELSE btrim(p_address)
  END;
$$;

CREATE TABLE public.btc_address_ownership_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address               text NOT NULL,
  user_id               uuid NOT NULL REFERENCES public.profiles(id),
  valid_from            timestamptz NOT NULL DEFAULT now(),
  valid_to              timestamptz,
  verification_method   text NOT NULL CHECK (verification_method IN ('signature', 'admin_manual')),
  verified_at           timestamptz NOT NULL DEFAULT now(),
  evidence_ref          text,
  created_by            uuid NOT NULL REFERENCES auth.users(id),
  request_id            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT btc_ownership_valid_range CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX idx_btc_ownership_active_unique
  ON public.btc_address_ownership_history (address)
  WHERE valid_to IS NULL;
CREATE INDEX idx_btc_ownership_address_time
  ON public.btc_address_ownership_history (address, verified_at DESC);
CREATE INDEX idx_btc_ownership_user
  ON public.btc_address_ownership_history (user_id);

-- Điểm 4: không có use case FE nào đọc trực tiếp mapping địa chỉ↔chủ sở hữu.
REVOKE ALL ON public.btc_address_ownership_history FROM PUBLIC;
REVOKE ALL ON public.btc_address_ownership_history FROM anon, authenticated;
GRANT ALL ON public.btc_address_ownership_history TO service_role;
ALTER TABLE public.btc_address_ownership_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btc_ownership_history_service_all"
  ON public.btc_address_ownership_history FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.resolve_btc_owner(p_address text, p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.btc_address_ownership_history
  WHERE address = public.btc_normalize_address(p_address)
    AND verified_at <= p_at
    AND (valid_to IS NULL OR valid_to > p_at)
  ORDER BY verified_at DESC
  LIMIT 1;
$$;

-- Điểm 1: chỉ service_role (edge function) được gọi.
REVOKE ALL ON FUNCTION public.resolve_btc_owner(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_btc_owner(text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_btc_owner(text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_btc_ownership(
  p_address text,
  p_user_id uuid,
  p_verification_method text,
  p_evidence_ref text,
  p_created_by uuid,
  p_request_id text DEFAULT NULL
)
RETURNS public.btc_address_ownership_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addr text := public.btc_normalize_address(p_address);
  v_row public.btc_address_ownership_history;
BEGIN
  IF p_verification_method NOT IN ('signature', 'admin_manual') THEN
    RAISE EXCEPTION 'invalid verification_method: %', p_verification_method;
  END IF;
  IF p_created_by IS NULL THEN
    RAISE EXCEPTION 'created_by is required';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  UPDATE public.btc_address_ownership_history
  SET valid_to = now()
  WHERE address = v_addr AND valid_to IS NULL;

  INSERT INTO public.btc_address_ownership_history (
    address, user_id, verification_method, verified_at, evidence_ref, created_by, request_id
  ) VALUES (
    v_addr, p_user_id, p_verification_method, now(), p_evidence_ref, p_created_by, p_request_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_btc_ownership(text, uuid, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_btc_ownership(text, uuid, text, text, uuid, text) TO service_role;

CREATE TABLE public.btc_ownership_challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  address       text NOT NULL,
  nonce         text NOT NULL UNIQUE,
  message       text NOT NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  ip_address    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_btc_ownership_challenges_nonce ON public.btc_ownership_challenges(nonce);
CREATE INDEX idx_btc_ownership_challenges_expires ON public.btc_ownership_challenges(expires_at);
CREATE INDEX idx_btc_ownership_challenges_user ON public.btc_ownership_challenges(user_id);

REVOKE ALL ON public.btc_ownership_challenges FROM PUBLIC;
REVOKE ALL ON public.btc_ownership_challenges FROM anon, authenticated;
GRANT ALL ON public.btc_ownership_challenges TO service_role;
ALTER TABLE public.btc_ownership_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No public access to btc_ownership_challenges"
  ON public.btc_ownership_challenges FOR ALL USING (false);

-- ══════════════════ Phase 2 — shadow log (chỉ quan sát) ══════════════════
CREATE TABLE public.btc_resolver_shadow_log (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address                         text NOT NULL,
  raw_address_legacy_side         text,
  observed_at                     timestamptz NOT NULL DEFAULT now(),
  event_at                        timestamptz NOT NULL,
  call_site                       text NOT NULL,
  tx_hash                         text,
  legacy_user_id                  uuid,
  legacy_source                   text NOT NULL,
  resolver_user_id                uuid,
  is_match                        boolean NOT NULL,
  suspected_legacy_format_mismatch boolean NOT NULL DEFAULT false,
  priority_account_flag           boolean NOT NULL DEFAULT false,
  idempotency_key                 text NOT NULL,
  request_id                      text,
  created_by                      text NOT NULL,
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_btc_shadow_log_idempotency ON public.btc_resolver_shadow_log(idempotency_key);
CREATE INDEX idx_btc_shadow_log_call_site ON public.btc_resolver_shadow_log(call_site);
CREATE INDEX idx_btc_shadow_log_mismatch ON public.btc_resolver_shadow_log(is_match) WHERE is_match = false;
CREATE INDEX idx_btc_shadow_log_priority ON public.btc_resolver_shadow_log(priority_account_flag) WHERE priority_account_flag = true;
CREATE INDEX idx_btc_shadow_log_address ON public.btc_resolver_shadow_log(address);
CREATE INDEX idx_btc_shadow_log_observed ON public.btc_resolver_shadow_log(observed_at);

REVOKE ALL ON public.btc_resolver_shadow_log FROM PUBLIC;
REVOKE ALL ON public.btc_resolver_shadow_log FROM anon, authenticated;
GRANT ALL ON public.btc_resolver_shadow_log TO service_role;
ALTER TABLE public.btc_resolver_shadow_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btc_resolver_shadow_log_service_only"
  ON public.btc_resolver_shadow_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.fn_btc_shadow_log_classify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.suspected_legacy_format_mismatch :=
    NOT NEW.is_match
    AND NEW.address !~* '^bc1'
    AND NEW.raw_address_legacy_side IS NOT NULL
    AND NEW.raw_address_legacy_side <> NEW.address;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_btc_shadow_log_classify
  BEFORE INSERT ON public.btc_resolver_shadow_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_btc_shadow_log_classify();

INSERT INTO public.app_settings (key, value)
VALUES ('btc_shadow_priority_usernames',
  '["angelkim","angelutopia","angelthienhanh68","angelgiau","angelqueanh"]')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_btc_shadow_log_priority_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usernames text[];
BEGIN
  BEGIN
    SELECT ARRAY(SELECT jsonb_array_elements_text(value::jsonb))
    INTO v_usernames
    FROM public.app_settings WHERE key = 'btc_shadow_priority_usernames';
  EXCEPTION WHEN OTHERS THEN
    v_usernames := NULL;
  END;
  v_usernames := COALESCE(v_usernames,
    ARRAY['angelkim','angelutopia','angelthienhanh68','angelgiau','angelqueanh']);

  NEW.priority_account_flag := EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id IN (NEW.legacy_user_id, NEW.resolver_user_id)
      AND p.username = ANY (v_usernames)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_btc_shadow_log_priority_flag
  BEFORE INSERT ON public.btc_resolver_shadow_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_btc_shadow_log_priority_flag();

-- Điểm 2: UNION — giữ NGUYÊN 44 type đang có trên DB thật, chỉ CỘNG THÊM
-- 'btc_shadow_priority_alert' ('btc_guard_drift' đã có sẵn).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY[
  'account_banned'::text, 'account_unbanned'::text, 'admin_email_farm'::text, 'admin_fraud_daily'::text,
  'admin_shared_device'::text, 'attestation_received'::text, 'btc_guard_drift'::text,
  'btc_address_cleared'::text, 'token_price_fetch_failed'::text, 'buddy_invite'::text,
  'care'::text, 'claim_reward'::text, 'comment'::text, 'comment_like'::text, 'did_promoted'::text,
  'donation'::text, 'epoch_claim_ready'::text, 'epoch_reset_info'::text, 'friend_accepted'::text,
  'friend_removed'::text, 'friend_request'::text, 'fun_mint_confirmed'::text, 'fun_mint_signed'::text,
  'haha'::text, 'impersonation_alert'::text, 'like'::text, 'live_replay_failed'::text,
  'live_started'::text, 'love'::text, 'mint_request_rejected'::text, 'mystery_box_legendary'::text,
  'mystery_box_received'::text, 'pet_battle_challenge'::text, 'pet_battle_result'::text,
  'pet_lumi_ready'::text, 'post_tagged'::text, 'post_moderation_hint'::text, 'pray'::text,
  'recovery_initiated'::text, 'reward_adjustment'::text, 'sbt_issued'::text, 'sbt_issued_quest'::text,
  'wallet_reconciliation_alert'::text, 'wow'::text,
  'btc_shadow_priority_alert'::text
])));

-- Điểm 3: dedup 24h/admin — không spam khi shadow-log chạy diện rộng.
CREATE OR REPLACE FUNCTION public.fn_btc_shadow_log_priority_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.priority_account_flag THEN
    INSERT INTO public.notifications (user_id, actor_id, type, read)
    SELECT ur.user_id, '00000000-0000-0000-0000-000000000000'::uuid,
           'btc_shadow_priority_alert', false
    FROM public.user_roles ur
    WHERE ur.role = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = ur.user_id
          AND n.type = 'btc_shadow_priority_alert'
          AND n.created_at > now() - interval '24 hours'
      );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_btc_shadow_log_priority_notify
  AFTER INSERT ON public.btc_resolver_shadow_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_btc_shadow_log_priority_notify();

CREATE OR REPLACE FUNCTION public.log_btc_resolver_shadow_comparison(
  p_address text,
  p_call_site text,
  p_legacy_user_id uuid,
  p_legacy_source text,
  p_idempotency_key text,
  p_created_by text,
  p_event_at timestamptz DEFAULT NULL,
  p_tx_hash text DEFAULT NULL,
  p_raw_address_legacy_side text DEFAULT NULL,
  p_request_id text DEFAULT NULL
)
RETURNS public.btc_resolver_shadow_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addr text := public.btc_normalize_address(p_address);
  v_event_at timestamptz := COALESCE(p_event_at, now());
  v_resolver_user_id uuid;
  v_is_match boolean;
  v_row public.btc_resolver_shadow_log;
BEGIN
  v_resolver_user_id := public.resolve_btc_owner(v_addr, v_event_at);
  v_is_match := (p_legacy_user_id IS NOT DISTINCT FROM v_resolver_user_id);

  INSERT INTO public.btc_resolver_shadow_log (
    address, raw_address_legacy_side, event_at, call_site, tx_hash,
    legacy_user_id, legacy_source, resolver_user_id, is_match,
    idempotency_key, request_id, created_by
  ) VALUES (
    v_addr, p_raw_address_legacy_side, v_event_at, p_call_site, p_tx_hash,
    p_legacy_user_id, p_legacy_source, v_resolver_user_id, v_is_match,
    p_idempotency_key, p_request_id, p_created_by
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.log_btc_resolver_shadow_comparison(
  text, text, uuid, text, text, text, timestamptz, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_btc_resolver_shadow_comparison(
  text, text, uuid, text, text, text, timestamptz, text, text, text
) TO service_role;