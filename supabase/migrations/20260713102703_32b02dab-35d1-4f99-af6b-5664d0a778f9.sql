DO $$
DECLARE
  affected int;
BEGIN
  UPDATE public.transactions
  SET amount = rtrim(rtrim(((amount::numeric)/100000000)::text,'0'),'.')
  WHERE upper(token_symbol)='BTC' AND (amount)::numeric > 1000;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 18 THEN
    RAISE EXCEPTION 'BTC P0 fix: expected 18 rows, got %', affected;
  END IF;
END $$;