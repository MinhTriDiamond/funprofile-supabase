CREATE OR REPLACE FUNCTION public.m6b_gap_plan_batches(_max_rows integer DEFAULT 8000)
RETURNS TABLE (inserted integer, total_batches integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ins integer := 0;
BEGIN
  WITH src AS (
    SELECT upper(t.token_symbol) AS sym,
           date_trunc('month', t.created_at)::date AS m,
           count(*) AS c
      FROM public.transactions t
     WHERE t.token_symbol IS NOT NULL
     GROUP BY 1, 2
  ), planned AS (
    SELECT sym, m, c, 0 AS half FROM src WHERE c <= _max_rows
    UNION ALL
    SELECT sym, m, c, 1 FROM src WHERE c > _max_rows
    UNION ALL
    SELECT sym, m, c, 2 FROM src WHERE c > _max_rows
  ), ins AS (
    INSERT INTO public.m6b_gap_scan_batches
      (token_symbol, month, half, range_start, range_end, est_rows)
    SELECT sym, m, half,
      CASE half WHEN 2 THEN m::timestamptz + interval '15 days' ELSE m::timestamptz END,
      CASE half WHEN 1 THEN m::timestamptz + interval '15 days'
                ELSE (m + interval '1 month')::timestamptz END,
      CASE WHEN half = 0 THEN c ELSE (c / 2) END
      FROM planned
    ON CONFLICT (token_symbol, month, half) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_ins FROM ins;

  RETURN QUERY
    SELECT v_ins, (SELECT count(*)::integer FROM public.m6b_gap_scan_batches);
END;
$$;

REVOKE ALL ON FUNCTION public.m6b_gap_plan_batches(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.m6b_gap_plan_batches(integer) TO service_role;

-- Chạy 1 lô: đếm rows_scanned + gap (dòng KHÔNG xuất hiện trong v_unified_transactions)
CREATE OR REPLACE FUNCTION public.m6b_gap_scan_run_batch(_batch_id uuid)
RETURNS public.m6b_gap_scan_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.m6b_gap_scan_batches;
  v_scanned integer := 0;
  v_gap integer := 0;
  v_samples jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_b FROM public.m6b_gap_scan_batches WHERE id = _batch_id;
  IF v_b.id IS NULL THEN
    RAISE EXCEPTION 'batch not found: %', _batch_id;
  END IF;

  WITH scoped AS (
    SELECT t.id, t.user_id, t.tx_hash, t.chain_id, t.token_symbol, t.token_address,
           t.amount, t.created_at,
           d.tx_hash AS d_hash, w.tx_hash AS w_hash
      FROM public.transactions t
      LEFT JOIN public.donations d
        ON lower(d.tx_hash) = lower(t.tx_hash) AND d.chain_id = t.chain_id
      LEFT JOIN public.wallet_transfers w
        ON lower(w.tx_hash) = lower(t.tx_hash) AND w.chain_id = t.chain_id AND w.user_id = t.user_id
     WHERE upper(t.token_symbol) = v_b.token_symbol
       AND t.created_at >= v_b.range_start
       AND t.created_at <  v_b.range_end
  ), gaps AS (
    SELECT * FROM scoped
     WHERE d_hash IS NULL AND w_hash IS NULL
       AND NOT (
         (upper(token_symbol) = 'BTC' AND chain_id = 0)
         OR (chain_id = 56 AND upper(token_symbol) = 'USDT')
         OR (chain_id = 56 AND upper(token_symbol) = 'BNB' AND token_address IS NULL)
       )
  )
  SELECT (SELECT count(*)::integer FROM scoped),
         (SELECT count(*)::integer FROM gaps),
         COALESCE((SELECT jsonb_agg(x) FROM (
             SELECT id, tx_hash, chain_id, token_symbol, amount, created_at
               FROM gaps ORDER BY created_at DESC LIMIT 20
           ) x), '[]'::jsonb)
    INTO v_scanned, v_gap, v_samples;

  UPDATE public.m6b_gap_scan_batches
     SET status = 'done', rows_scanned = v_scanned, gap_found = v_gap,
         gap_samples = v_samples, finished_at = now(), last_error = NULL
   WHERE id = _batch_id
  RETURNING * INTO v_b;

  RETURN v_b;
END;
$$;

REVOKE ALL ON FUNCTION public.m6b_gap_scan_run_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.m6b_gap_scan_run_batch(uuid) TO service_role;