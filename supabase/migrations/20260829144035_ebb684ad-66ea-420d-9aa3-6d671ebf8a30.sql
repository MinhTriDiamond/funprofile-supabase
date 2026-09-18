CREATE OR REPLACE FUNCTION public.get_user_gift_breakdown(
  p_user_id uuid,
  p_direction text,
  p_prices jsonb DEFAULT NULL
)
RETURNS TABLE (
  token_symbol text,
  cnt bigint,
  total_amount numeric,
  price_usd numeric,
  usd_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ext AS (
    SELECT sym, price FROM public.normalize_price_map(p_prices)
  ),
  raw AS (
    SELECT
      CASE WHEN upper(coalesce(d.token_symbol, 'UNKNOWN')) = 'BNB'
           THEN CASE WHEN d.chain_id = 97 THEN 'BNB (BSC Testnet)' ELSE 'BNB (BSC Chain)' END
           ELSE upper(coalesce(d.token_symbol, 'UNKNOWN')) END AS label,
      public._safe_numeric(d.amount::text) AS amt
    FROM public.donations d
    WHERE d.status = 'confirmed'
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND ((p_direction = 'sent' AND d.sender_id = p_user_id)
        OR (p_direction = 'received' AND d.recipient_id = p_user_id))

    UNION ALL

    SELECT
      CASE WHEN upper(coalesce(wt.token_symbol, 'UNKNOWN')) = 'BNB'
           THEN CASE WHEN wt.chain_id = 97 THEN 'BNB (BSC Testnet)' ELSE 'BNB (BSC Chain)' END
           ELSE upper(coalesce(wt.token_symbol, 'UNKNOWN')) END,
      public._safe_numeric(wt.amount::text)
    FROM public.wallet_transfers wt
    WHERE wt.status = 'confirmed'
      AND wt.user_id = p_user_id
      AND wt.direction = CASE WHEN p_direction = 'sent' THEN 'out' ELSE 'in' END

    UNION ALL

    SELECT
      CASE WHEN upper(coalesce(st.from_symbol, 'UNKNOWN')) = 'BNB'
           THEN CASE WHEN st.chain_id = 97 THEN 'BNB (BSC Testnet)' ELSE 'BNB (BSC Chain)' END
           ELSE upper(coalesce(st.from_symbol, 'UNKNOWN')) END,
      public._safe_numeric(st.from_amount::text)
    FROM public.swap_transactions st
    WHERE st.status = 'confirmed'
      AND st.user_id = p_user_id
      AND p_direction = 'sent'
  ),
  agg AS (
    SELECT label, count(*)::bigint AS cnt, sum(coalesce(amt, 0)) AS total_amount
    FROM raw
    GROUP BY label
  ),
  priced AS (
    SELECT
      a.label,
      a.cnt,
      a.total_amount,
      COALESCE(
        (SELECT e.price FROM ext e
          WHERE e.sym = public.normalize_price_symbol(
            CASE WHEN a.label LIKE 'BNB%' THEN 'BNB' ELSE a.label END)),
        public.get_token_price_now(public.normalize_price_symbol(
          CASE WHEN a.label LIKE 'BNB%' THEN 'BNB' ELSE a.label END))
      ) AS price_usd
    FROM agg a
  )
  SELECT
    p.label AS token_symbol,
    p.cnt,
    p.total_amount,
    p.price_usd,
    CASE WHEN p.price_usd IS NULL THEN NULL ELSE p.total_amount * p.price_usd END AS usd_value
  FROM priced p
  ORDER BY (CASE WHEN p.price_usd IS NULL THEN 0 ELSE p.total_amount * p.price_usd END) DESC,
           p.cnt DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_gift_breakdown(uuid, text, jsonb) TO anon, authenticated, service_role;