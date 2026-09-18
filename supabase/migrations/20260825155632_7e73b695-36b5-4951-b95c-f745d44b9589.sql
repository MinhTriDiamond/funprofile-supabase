CREATE OR REPLACE FUNCTION public.btc_normalize_address(p_address text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_address ~* '^bc1[a-z0-9]+$' THEN lower(btrim(p_address))
    ELSE btrim(p_address)
  END;
$$;

CREATE OR REPLACE FUNCTION public.fn_btc_shadow_log_classify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
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