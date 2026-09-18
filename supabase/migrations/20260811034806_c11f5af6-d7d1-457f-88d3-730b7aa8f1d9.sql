DO $$
DECLARE
  v_name TEXT;
  v_def TEXT;
BEGIN
  SELECT conname, pg_get_constraintdef(oid) INTO v_name, v_def
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%btc_guard_drift%'
  LIMIT 1;

  IF v_name IS NOT NULL AND v_def NOT LIKE '%token_price_fetch_failed%' THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', v_name);
    v_def := replace(v_def, '''btc_guard_drift''', '''btc_guard_drift''::text, ''token_price_fetch_failed''');
    EXECUTE format('ALTER TABLE public.notifications ADD CONSTRAINT %I %s', v_name, v_def);
  END IF;
END $$;