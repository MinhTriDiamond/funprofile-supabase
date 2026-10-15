CREATE OR REPLACE FUNCTION public.get_donation_global_stats(p_time_range text DEFAULT 'all'::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(totals_by_token jsonb, total_donated_usd numeric, total_donations bigint, total_donors bigint, total_recipients bigint, total_light_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_since timestamptz; v_until timestamptz;
BEGIN
  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from; v_until := p_to;
  ELSE
    v_until := NULL;
    v_since := CASE p_time_range
      WHEN 'day'   THEN now() - interval '1 day'
      WHEN 'week'  THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL END;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT d.token_symbol, d.amount_num AS amount,
      d.amount_usd,
      d.sender_id, d.recipient_id, d.tx_hash,
      d.light_score_earned
    FROM public.donation_board_base d
    WHERE d.status = 'confirmed'
      AND d.chain_id <> 97
      AND d.amount_usd > 0
      AND d.registry_eligible
      AND (d.registry_max_single_usd IS NULL OR d.amount_usd <= d.registry_max_single_usd)
      AND NOT d.sender_excluded
      AND NOT d.recipient_excluded
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
  ), per_token AS (
    SELECT token_symbol, SUM(amount) AS token_amount,
      SUM(amount_usd) AS token_usd, COUNT(DISTINCT tx_hash) AS token_transactions
    FROM base GROUP BY token_symbol
  ), extra_tokens AS (
    -- Tokens present on the board base but with no USD-eligible rows (e.g. FUN testnet, TONCOIN):
    -- listed for completeness with usd = NULL (no price shown, never 0).
    SELECT d.token_symbol, SUM(d.amount_num) AS amt, COUNT(DISTINCT d.tx_hash) AS txs
    FROM public.donation_board_base d
    WHERE d.status = 'confirmed'
      AND NOT d.sender_excluded AND NOT d.recipient_excluded
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
      AND d.token_symbol NOT IN (SELECT token_symbol FROM per_token)
    GROUP BY d.token_symbol
  )
  SELECT
    (SELECT COALESCE(jsonb_object_agg(token_symbol,
        jsonb_build_object('amount', amt, 'usd', usd, 'transactions', txs)
        ORDER BY token_symbol), '{}'::jsonb)
     FROM (SELECT token_symbol, token_amount AS amt, token_usd AS usd, token_transactions AS txs FROM per_token
           UNION ALL
           SELECT token_symbol, amt, NULL::numeric AS usd, txs FROM extra_tokens) u),
    (SELECT COALESCE(SUM(amount_usd), 0)::numeric FROM base),
    (SELECT COUNT(DISTINCT tx_hash) FROM base)::bigint,
    (SELECT COUNT(DISTINCT sender_id) FROM base)::bigint,
    (SELECT COUNT(DISTINCT recipient_id) FROM base)::bigint,
    (SELECT COALESCE(SUM(light_score_earned), 0)::numeric FROM base);
END; $function$
;
