INSERT INTO public.system_config (key, value)
VALUES (
  'btc_resolver_fn_checksum',
  jsonb_build_object(
    'audited_at', '2026-09-03T03:25:54Z',
    'audited_by', 'lovable/backfill_20260903',
    'algo', 'md5(pg_proc.prosrc)',
    'functions', jsonb_build_object(
      'resolve_btc_owner', 'd015b5198034b41cd175f6c503f7185a',
      'btc_normalize_address', 'bd99e34afc5595498794d4b18c8e6b83',
      'log_btc_resolver_shadow_comparison', 'e779d8f8fbc503bc03764722ca4485b1'
    )
  )
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.btc_resolver_fn_checksum_verify()
RETURNS TABLE (fn_name text, expected_md5 text, actual_md5 text, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  baseline jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT value -> 'functions' INTO baseline
  FROM public.system_config WHERE key = 'btc_resolver_fn_checksum';

  RETURN QUERY
  SELECT b.key::text,
         (b.value #>> '{}')::text,
         md5(p.prosrc)::text,
         CASE
           WHEN p.prosrc IS NULL THEN 'missing_function'
           WHEN md5(p.prosrc) = (b.value #>> '{}') THEN 'match'
           ELSE 'mismatch'
         END
  FROM jsonb_each(COALESCE(baseline, '{}'::jsonb)) AS b(key, value)
  LEFT JOIN pg_proc p
    ON p.proname = b.key
   AND p.pronamespace = 'public'::regnamespace;
END;
$$;

REVOKE ALL ON FUNCTION public.btc_resolver_fn_checksum_verify() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btc_resolver_fn_checksum_verify() TO authenticated, service_role;