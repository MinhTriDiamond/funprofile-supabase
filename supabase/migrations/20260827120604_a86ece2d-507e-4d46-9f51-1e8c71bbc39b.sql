DO $do$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('public.v_unified_transactions'::regclass, true);
  IF position('_safe_numeric(t.amount) AS amount_decimal' in d) = 0 THEN
    RAISE EXCEPTION 'anchor not found in v_unified_transactions definition';
  END IF;
  d := replace(d, '_safe_numeric(t.amount) AS amount_decimal',
    'COALESCE(t.amount_normalized, _safe_numeric(t.amount)) AS amount_decimal');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_unified_transactions AS ' || d;
END $do$;