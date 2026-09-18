DO $mig$
DECLARE
  d text;
  old_where text := 'WHERE (upper(t.token_symbol) = ''BTC''::text AND t.chain_id = 0 OR t.chain_id = 56 AND upper(t.token_symbol) = ''USDT''::text OR t.chain_id = 56 AND upper(t.token_symbol) = ''BNB''::text AND t.token_address IS NULL) AND d.tx_hash IS NULL AND w.tx_hash IS NULL';
  new_where text := 'WHERE (upper(t.token_symbol) = ''BTC''::text AND t.chain_id = 0 OR t.chain_id = 56 AND upper(t.token_symbol) = ''USDT''::text OR t.chain_id = 56 AND upper(t.token_symbol) = ''BNB''::text AND t.token_address IS NULL OR upper(t.token_symbol) = ''CAMLY''::text AND t.chain_id = ANY (ARRAY[56, 137]) OR upper(t.token_symbol) = ''FUN''::text AND t.chain_id = 56) AND d.tx_hash IS NULL AND w.tx_hash IS NULL';
BEGIN
  d := pg_get_viewdef('public.v_unified_transactions'::regclass, true);
  IF position(old_where in d) = 0 THEN
    RAISE EXCEPTION 'Whitelist cu khong tim thay trong dinh nghia view - dung migration de tranh ghi de sai';
  END IF;
  d := replace(d, old_where, new_where);
  EXECUTE 'CREATE OR REPLACE VIEW public.v_unified_transactions AS ' || rtrim(rtrim(d), ';');
END
$mig$;