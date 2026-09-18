INSERT INTO public.app_settings (key, value)
VALUES ('btc_manual_confirm_enabled', 'false')
ON CONFLICT (key) DO UPDATE SET value = 'false';

CREATE OR REPLACE FUNCTION public.btc_manual_confirm_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT lower(value) = 'true' FROM public.app_settings WHERE key = 'btc_manual_confirm_enabled'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.btc_manual_confirm_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btc_manual_confirm_enabled() TO authenticated, anon, service_role;