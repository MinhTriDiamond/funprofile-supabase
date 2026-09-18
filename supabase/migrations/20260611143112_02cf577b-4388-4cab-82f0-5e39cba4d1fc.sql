
-- ============================================
-- 1. EXTEND AUDIT TRIGGER TO COVER btc_address + request_id
-- ============================================

ALTER TABLE public.profiles_wallet_audit
  ADD COLUMN IF NOT EXISTS request_id text;

-- Replace audit trigger function to cover btc_address
CREATE OR REPLACE FUNCTION public.audit_wallet_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by uuid;
  v_request_id text;
  v_app text;
  v_session_user text;
  v_current_user text;
  v_client inet;
BEGIN
  BEGIN
    v_changed_by := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;
  v_request_id := nullif(current_setting('request.id', true), '');
  v_app := current_setting('application_name', true);
  v_session_user := session_user::text;
  v_current_user := current_user::text;
  BEGIN
    v_client := inet_client_addr();
  EXCEPTION WHEN OTHERS THEN
    v_client := NULL;
  END;

  IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_at, changed_by, db_session_user, db_current_user, application_name, client_addr, request_id)
    VALUES (NEW.id, 'wallet_address', OLD.wallet_address, NEW.wallet_address, now(), v_changed_by, v_session_user, v_current_user, v_app, v_client, v_request_id);
  END IF;
  IF NEW.external_wallet_address IS DISTINCT FROM OLD.external_wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_at, changed_by, db_session_user, db_current_user, application_name, client_addr, request_id)
    VALUES (NEW.id, 'external_wallet_address', OLD.external_wallet_address, NEW.external_wallet_address, now(), v_changed_by, v_session_user, v_current_user, v_app, v_client, v_request_id);
  END IF;
  IF NEW.public_wallet_address IS DISTINCT FROM OLD.public_wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_at, changed_by, db_session_user, db_current_user, application_name, client_addr, request_id)
    VALUES (NEW.id, 'public_wallet_address', OLD.public_wallet_address, NEW.public_wallet_address, now(), v_changed_by, v_session_user, v_current_user, v_app, v_client, v_request_id);
  END IF;
  IF NEW.custodial_wallet_address IS DISTINCT FROM OLD.custodial_wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_at, changed_by, db_session_user, db_current_user, application_name, client_addr, request_id)
    VALUES (NEW.id, 'custodial_wallet_address', OLD.custodial_wallet_address, NEW.custodial_wallet_address, now(), v_changed_by, v_session_user, v_current_user, v_app, v_client, v_request_id);
  END IF;
  IF NEW.btc_address IS DISTINCT FROM OLD.btc_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_at, changed_by, db_session_user, db_current_user, application_name, client_addr, request_id)
    VALUES (NEW.id, 'btc_address', OLD.btc_address, NEW.btc_address, now(), v_changed_by, v_session_user, v_current_user, v_app, v_client, v_request_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_wallet_changes ON public.profiles;
CREATE TRIGGER trg_audit_wallet_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_wallet_changes();

-- ============================================
-- 2. EMERGENCY KILL SWITCH
-- ============================================

INSERT INTO public.app_settings(key, value)
VALUES ('wallet_updates_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_wallet_kill_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  -- skip if no wallet column actually changed
  IF NEW.wallet_address IS NOT DISTINCT FROM OLD.wallet_address
     AND NEW.external_wallet_address IS NOT DISTINCT FROM OLD.external_wallet_address
     AND NEW.public_wallet_address IS NOT DISTINCT FROM OLD.public_wallet_address
     AND NEW.custodial_wallet_address IS NOT DISTINCT FROM OLD.custodial_wallet_address
     AND NEW.btc_address IS NOT DISTINCT FROM OLD.btc_address THEN
    RETURN NEW;
  END IF;

  SELECT (value)::text::boolean INTO v_enabled FROM public.app_settings WHERE key='wallet_updates_enabled';
  IF v_enabled IS NULL OR v_enabled = true THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'WALLET_UPDATES_DISABLED: ví đang ở chế độ khẩn cấp — mọi thay đổi cột ví bị tạm khoá. Liên hệ admin để bật lại (app_settings.wallet_updates_enabled).'
    USING ERRCODE='check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_kill_switch ON public.profiles;
CREATE TRIGGER trg_wallet_kill_switch
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_kill_switch();

-- ============================================
-- 3. BULK-UPDATE DETECTION (alert only, no block)
-- ============================================

CREATE TABLE IF NOT EXISTS public.wallet_bulk_update_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  affected_count int NOT NULL,
  application_name text,
  db_session_user text,
  client_addr inet,
  changed_by uuid,
  sample_user_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_bulk_update_alerts TO authenticated;
GRANT ALL ON public.wallet_bulk_update_alerts TO service_role;
ALTER TABLE public.wallet_bulk_update_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read wallet bulk alerts"
  ON public.wallet_bulk_update_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages bulk alerts"
  ON public.wallet_bulk_update_alerts FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Cron-style aggregation function (gọi định kỳ qua pg_cron mỗi 5 phút)
CREATE OR REPLACE FUNCTION public.detect_wallet_bulk_updates(p_window_minutes int DEFAULT 1, p_threshold int DEFAULT 20)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
BEGIN
  WITH agg AS (
    SELECT
      date_trunc('minute', changed_at) AS window_start,
      application_name,
      db_session_user,
      client_addr,
      changed_by,
      COUNT(DISTINCT user_id) AS affected_count,
      (array_agg(DISTINCT user_id))[1:5] AS sample_ids,
      MIN(changed_at) AS w_start,
      MAX(changed_at) AS w_end
    FROM public.profiles_wallet_audit
    WHERE changed_at >= now() - (p_window_minutes || ' minutes')::interval
      AND changed_at < date_trunc('minute', now())
    GROUP BY 1,2,3,4,5
    HAVING COUNT(DISTINCT user_id) > p_threshold
  )
  INSERT INTO public.wallet_bulk_update_alerts(window_start, window_end, affected_count, application_name, db_session_user, client_addr, changed_by, sample_user_ids)
  SELECT a.w_start, a.w_end, a.affected_count, a.application_name, a.db_session_user, a.client_addr, a.changed_by, a.sample_ids
  FROM agg a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.wallet_bulk_update_alerts x
    WHERE x.window_start = a.w_start
      AND x.application_name IS NOT DISTINCT FROM a.application_name
      AND x.client_addr IS NOT DISTINCT FROM a.client_addr
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_wallet_bulk_updates(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_wallet_bulk_updates(int, int) TO service_role;

-- Schedule via pg_cron: mỗi phút check 5 phút gần nhất
SELECT cron.schedule(
  'wallet-bulk-update-detector',
  '* * * * *',
  $$ SELECT public.detect_wallet_bulk_updates(5, 20); $$
);
