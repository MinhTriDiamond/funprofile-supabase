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
  EXCEPTION WHEN OTHERS THEN v_app_name := NULL; END;
  BEGIN
    v_client_addr := inet_client_addr();
  EXCEPTION WHEN OTHERS THEN v_client_addr := NULL; END;

  IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_by, application_name, client_addr)
    VALUES (NEW.id, 'wallet_address', OLD.wallet_address, NEW.wallet_address, auth.uid(), v_app_name, v_client_addr);
  END IF;
  IF NEW.external_wallet_address IS DISTINCT FROM OLD.external_wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_by, application_name, client_addr)
    VALUES (NEW.id, 'external_wallet_address', OLD.external_wallet_address, NEW.external_wallet_address, auth.uid(), v_app_name, v_client_addr);
  END IF;
  IF NEW.public_wallet_address IS DISTINCT FROM OLD.public_wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_by, application_name, client_addr)
    VALUES (NEW.id, 'public_wallet_address', OLD.public_wallet_address, NEW.public_wallet_address, auth.uid(), v_app_name, v_client_addr);
  END IF;
  IF NEW.custodial_wallet_address IS DISTINCT FROM OLD.custodial_wallet_address THEN
    INSERT INTO public.profiles_wallet_audit(user_id, column_name, old_value, new_value, changed_by, application_name, client_addr)
    VALUES (NEW.id, 'custodial_wallet_address', OLD.custodial_wallet_address, NEW.custodial_wallet_address, auth.uid(), v_app_name, v_client_addr);
  END IF;
  RETURN NEW;
END;
$$;