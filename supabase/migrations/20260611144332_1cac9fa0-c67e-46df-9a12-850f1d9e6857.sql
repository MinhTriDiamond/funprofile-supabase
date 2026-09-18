
INSERT INTO public.app_settings (key, value) VALUES
  ('wallet_writes_strict_mode', 'false'),
  ('wallet_writers_allowed', '["btc-wallet-audit","connect-external-wallet","disconnect-external-wallet","identity-link-manage","admin-wallet-restore","custodial-wallet-create","auth-wallet-link","manual-admin-update"]')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.wallet_bulk_update_alerts
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS note text;

CREATE TABLE IF NOT EXISTS public.wallet_writer_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  column_name text NOT NULL,
  old_value text,
  new_value text,
  writer_tag text,
  is_allowed boolean NOT NULL,
  strict_mode boolean NOT NULL,
  blocked boolean NOT NULL DEFAULT false,
  application_name text,
  db_session_user text,
  client_addr inet,
  changed_by uuid,
  request_id text
);
GRANT SELECT ON public.wallet_writer_audit TO authenticated;
GRANT ALL ON public.wallet_writer_audit TO service_role;
ALTER TABLE public.wallet_writer_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallet_writer_audit_admin_read" ON public.wallet_writer_audit;
CREATE POLICY "wallet_writer_audit_admin_read"
  ON public.wallet_writer_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_wwa_occurred ON public.wallet_writer_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_wwa_blocked ON public.wallet_writer_audit (blocked, occurred_at DESC) WHERE blocked = true;

CREATE TABLE IF NOT EXISTS public.wallet_security_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL,
  setting_key text NOT NULL,
  old_value text,
  new_value text,
  reason text
);
GRANT SELECT ON public.wallet_security_audit TO authenticated;
GRANT ALL ON public.wallet_security_audit TO service_role;
ALTER TABLE public.wallet_security_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallet_security_audit_admin_read" ON public.wallet_security_audit;
CREATE POLICY "wallet_security_audit_admin_read"
  ON public.wallet_security_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_wsa_changed ON public.wallet_security_audit (changed_at DESC);

CREATE OR REPLACE FUNCTION public.fn_wallet_writer_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_strict boolean;
  v_allowed_raw text;
  v_allowed jsonb;
  v_writer text;
  v_is_allowed boolean;
  v_block boolean;
  v_request_id text;
  v_cols text[] := ARRAY['wallet_address','public_wallet_address','external_wallet_address','btc_address'];
  v_col text;
  v_old text;
  v_new text;
BEGIN
  SELECT (value)::boolean INTO v_strict FROM public.app_settings WHERE key = 'wallet_writes_strict_mode';
  SELECT value INTO v_allowed_raw FROM public.app_settings WHERE key = 'wallet_writers_allowed';
  v_strict := COALESCE(v_strict, false);
  BEGIN v_allowed := v_allowed_raw::jsonb; EXCEPTION WHEN OTHERS THEN v_allowed := '[]'::jsonb; END;

  v_writer := NULLIF(current_setting('app.wallet_writer', true), '');
  v_is_allowed := v_writer IS NOT NULL AND v_allowed ? v_writer;
  v_block := v_strict AND NOT v_is_allowed;

  BEGIN
    v_request_id := current_setting('request.headers', true)::jsonb->>'x-request-id';
  EXCEPTION WHEN OTHERS THEN v_request_id := NULL;
  END;

  FOREACH v_col IN ARRAY v_cols LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_col, v_col)
      INTO v_old, v_new USING OLD, NEW;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.wallet_writer_audit
        (user_id, column_name, old_value, new_value, writer_tag,
         is_allowed, strict_mode, blocked,
         application_name, db_session_user, client_addr, changed_by, request_id)
      VALUES
        (NEW.id, v_col, v_old, v_new, v_writer,
         v_is_allowed, v_strict, v_block,
         current_setting('application_name', true),
         session_user, inet_client_addr(), auth.uid(), v_request_id);
    END IF;
  END LOOP;

  IF v_block THEN
    RAISE EXCEPTION 'WALLET_WRITER_NOT_ALLOWED: tag=% strict=on', COALESCE(v_writer, '(none)')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_writer_guard ON public.profiles;
CREATE TRIGGER trg_wallet_writer_guard
  BEFORE UPDATE OF wallet_address, public_wallet_address, external_wallet_address, btc_address
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_wallet_writer_guard();

UPDATE public.wallet_bulk_update_alerts
SET severity = CASE
  WHEN affected_count >= 200 THEN 'critical'
  WHEN affected_count >= 50 THEN 'high'
  WHEN affected_count >= 20 THEN 'medium'
  ELSE 'low'
END;

CREATE OR REPLACE FUNCTION public.set_wallet_kill_switch(_enabled boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_old text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;
  SELECT value INTO v_old FROM public.app_settings WHERE key = 'wallet_updates_enabled';
  INSERT INTO public.app_settings(key, value) VALUES('wallet_updates_enabled', _enabled::text)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO public.wallet_security_audit(changed_by, setting_key, old_value, new_value, reason)
    VALUES (auth.uid(), 'wallet_updates_enabled', v_old, _enabled::text, _reason);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_wallet_kill_switch(boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_wallet_strict_mode(_enabled boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_old text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;
  SELECT value INTO v_old FROM public.app_settings WHERE key = 'wallet_writes_strict_mode';
  INSERT INTO public.app_settings(key, value) VALUES('wallet_writes_strict_mode', _enabled::text)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO public.wallet_security_audit(changed_by, setting_key, old_value, new_value, reason)
    VALUES (auth.uid(), 'wallet_writes_strict_mode', v_old, _enabled::text, _reason);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_wallet_strict_mode(boolean, text) TO authenticated;
