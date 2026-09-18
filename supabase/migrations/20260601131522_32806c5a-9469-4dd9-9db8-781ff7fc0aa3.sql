-- Audit table for wallet column changes on profiles
CREATE TABLE IF NOT EXISTS public.profiles_wallet_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  column_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID,
  db_session_user TEXT DEFAULT session_user,
  db_current_user TEXT DEFAULT current_user,
  application_name TEXT,
  client_addr INET
);

GRANT SELECT ON public.profiles_wallet_audit TO authenticated;
GRANT ALL ON public.profiles_wallet_audit TO service_role;

ALTER TABLE public.profiles_wallet_audit ENABLE ROW LEVEL SECURITY;

-- Only admins can read; service_role bypasses RLS
CREATE POLICY "Admins can view wallet audit"
ON public.profiles_wallet_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_profiles_wallet_audit_user ON public.profiles_wallet_audit(user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_audit_time ON public.profiles_wallet_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_audit_newval ON public.profiles_wallet_audit(new_value);

-- Trigger function: log changes on 4 wallet columns
CREATE OR REPLACE FUNCTION public.log_profiles_wallet_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_name TEXT;
  v_client_addr INET;
BEGIN
  BEGIN
    v_app_name := current_setting('application_name', true);
  EXCEPTION WHEN OTHERS THEN v_app_name := NULL;
  END;
  BEGIN
    v_client_addr := inet_client_addr();
  EXCEPTION WHEN OTHERS THEN v_client_addr := NULL;
  END;

  IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_by, application_name, client_addr)
    VALUES (NEW.user_id, 'wallet_address', OLD.wallet_address, NEW.wallet_address, auth.uid(), v_app_name, v_client_addr);
  END IF;

  IF NEW.external_wallet_address IS DISTINCT FROM OLD.external_wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_by, application_name, client_addr)
    VALUES (NEW.user_id, 'external_wallet_address', OLD.external_wallet_address, NEW.external_wallet_address, auth.uid(), v_app_name, v_client_addr);
  END IF;

  IF NEW.public_wallet_address IS DISTINCT FROM OLD.public_wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_by, application_name, client_addr)
    VALUES (NEW.user_id, 'public_wallet_address', OLD.public_wallet_address, NEW.public_wallet_address, auth.uid(), v_app_name, v_client_addr);
  END IF;

  IF NEW.custodial_wallet_address IS DISTINCT FROM OLD.custodial_wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_by, application_name, client_addr)
    VALUES (NEW.user_id, 'custodial_wallet_address', OLD.custodial_wallet_address, NEW.custodial_wallet_address, auth.uid(), v_app_name, v_client_addr);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profiles_wallet_changes ON public.profiles;
CREATE TRIGGER trg_log_profiles_wallet_changes
AFTER UPDATE OF wallet_address, external_wallet_address, public_wallet_address, custodial_wallet_address
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profiles_wallet_changes();