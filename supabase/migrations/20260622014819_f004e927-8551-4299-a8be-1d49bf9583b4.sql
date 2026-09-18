
-- ============ Audit table ============
CREATE TABLE IF NOT EXISTS public.transactions_trust_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_kind text NOT NULL,
  target_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.transactions_trust_admin_audit TO authenticated;
GRANT ALL ON public.transactions_trust_admin_audit TO service_role;

ALTER TABLE public.transactions_trust_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tt_audit_admin_select"
  ON public.transactions_trust_admin_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS tt_audit_created_idx ON public.transactions_trust_admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS tt_audit_admin_idx ON public.transactions_trust_admin_audit (admin_id, created_at DESC);

-- ============ RPCs (admin-only, SECURITY DEFINER) ============

-- Approve a suspicious event => insert into tokens_registry as allowed + delete sus rows
CREATE OR REPLACE FUNCTION public.tt_approve_suspicious(
  p_event_id uuid,
  p_symbol text,
  p_name text,
  p_decimals int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev record;
  new_registry_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO ev FROM public.suspicious_wallet_events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF ev.raw_token_address IS NULL THEN RAISE EXCEPTION 'cannot_approve_native'; END IF;

  INSERT INTO public.tokens_registry (
    chain_id, network, token_address, symbol, name, decimals,
    risk_level, is_verified, is_active, source
  ) VALUES (
    ev.chain_id, ev.network, lower(ev.raw_token_address),
    p_symbol, COALESCE(p_name, p_symbol), COALESCE(p_decimals, 18),
    'allowed', true, true, 'manual/from-suspicious'
  )
  ON CONFLICT (chain_id, token_address) DO UPDATE
    SET risk_level = 'allowed', is_active = true, symbol = EXCLUDED.symbol,
        name = EXCLUDED.name, decimals = EXCLUDED.decimals, updated_at = now()
  RETURNING id INTO new_registry_id;

  DELETE FROM public.suspicious_wallet_events
   WHERE chain_id = ev.chain_id
     AND lower(raw_token_address) = lower(ev.raw_token_address);

  INSERT INTO public.transactions_trust_admin_audit
    (admin_id, action, target_kind, target_id, payload)
  VALUES (
    auth.uid(), 'approve_suspicious', 'tokens_registry', new_registry_id,
    jsonb_build_object(
      'source_event_id', p_event_id,
      'chain_id', ev.chain_id,
      'token_address', lower(ev.raw_token_address),
      'symbol', p_symbol,
      'decimals', p_decimals
    )
  );

  RETURN new_registry_id;
END $$;

REVOKE ALL ON FUNCTION public.tt_approve_suspicious(uuid, text, text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.tt_approve_suspicious(uuid, text, text, int) TO authenticated;

-- Block contract
CREATE OR REPLACE FUNCTION public.tt_block_suspicious(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev record;
  reg_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO ev FROM public.suspicious_wallet_events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF ev.raw_token_address IS NULL THEN RAISE EXCEPTION 'cannot_block_native'; END IF;

  INSERT INTO public.tokens_registry (
    chain_id, network, token_address, symbol, name, decimals,
    risk_level, is_verified, is_active, source
  ) VALUES (
    ev.chain_id, ev.network, lower(ev.raw_token_address),
    COALESCE(ev.raw_symbol, 'BLOCKED'),
    COALESCE(ev.raw_symbol, 'Blocked Token'),
    COALESCE(ev.raw_decimals, 18),
    'blocked', false, true, 'manual/block'
  )
  ON CONFLICT (chain_id, token_address) DO UPDATE
    SET risk_level = 'blocked', is_active = true, updated_at = now()
  RETURNING id INTO reg_id;

  INSERT INTO public.transactions_trust_admin_audit
    (admin_id, action, target_kind, target_id, payload)
  VALUES (
    auth.uid(), 'block_suspicious', 'tokens_registry', reg_id,
    jsonb_build_object(
      'source_event_id', p_event_id,
      'chain_id', ev.chain_id,
      'token_address', lower(ev.raw_token_address),
      'raw_symbol', ev.raw_symbol
    )
  );

  RETURN reg_id;
END $$;

REVOKE ALL ON FUNCTION public.tt_block_suspicious(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.tt_block_suspicious(uuid) TO authenticated;

-- Ignore event
CREATE OR REPLACE FUNCTION public.tt_ignore_suspicious(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ev record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO ev FROM public.suspicious_wallet_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.suspicious_wallet_events WHERE id = p_event_id;

  INSERT INTO public.transactions_trust_admin_audit
    (admin_id, action, target_kind, target_id, payload)
  VALUES (
    auth.uid(), 'ignore_suspicious', 'suspicious_wallet_events', p_event_id,
    jsonb_build_object(
      'chain_id', ev.chain_id,
      'token_address', ev.raw_token_address,
      'raw_symbol', ev.raw_symbol,
      'reason', ev.reason
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.tt_ignore_suspicious(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.tt_ignore_suspicious(uuid) TO authenticated;

-- Ack drift alert
CREATE OR REPLACE FUNCTION public.tt_ack_drift(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.registry_drift_alerts
     SET ack = true, ack_at = now()
   WHERE id = p_alert_id;

  INSERT INTO public.transactions_trust_admin_audit
    (admin_id, action, target_kind, target_id, payload)
  VALUES (auth.uid(), 'ack_drift', 'registry_drift_alerts', p_alert_id, '{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.tt_ack_drift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.tt_ack_drift(uuid) TO authenticated;
