CREATE OR REPLACE FUNCTION public.get_global_wallet_flow_breakdown(p_direction text, p_prices jsonb DEFAULT NULL::jsonb)
RETURNS TABLE(token_symbol text, source text, count bigint, total_amount numeric, usd_value numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH external_prices AS (
    SELECT UPPER(key) AS sym, NULLIF(value, 'null')::numeric AS price
    FROM jsonb_each_text(COALESCE(p_prices, '{}'::jsonb))
  ),
  fallback_prices AS (
    SELECT * FROM (VALUES
      ('BTC', 100000.0), ('BTCB', 100000.0), ('WBTC', 100000.0),
      ('ETH', 3500.0), ('WETH', 3500.0),
      ('BNB', 700.0), ('WBNB', 700.0),
      ('USDT', 1.0), ('USDC', 1.0), ('DAI', 1.0), ('BUSD', 1.0),
      ('CAMLY', 0.000014),
      ('POL', 0.5), ('MATIC', 0.5)
    ) AS t(sym, price)
  ),
  price_of AS (
    SELECT COALESCE(f.sym, e.sym) AS sym,
           COALESCE(e.price, f.price, 0) AS price
    FROM fallback_prices f
    FULL OUTER JOIN external_prices e ON e.sym = f.sym
  ),
  -- Internal donations (member ↔ member, confirmed)
  donations_internal AS (
    SELECT UPPER(d.token_symbol) AS sym, 'donations_internal'::text AS src,
           COUNT(*)::bigint AS c,
           COALESCE(SUM((d.amount)::numeric), 0) AS amt
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
    GROUP BY UPPER(d.token_symbol)
  ),
  -- External donations (deposits from outside wallets, sender_id null hoặc is_external)
  donations_external AS (
    SELECT UPPER(d.token_symbol) AS sym, 'donations_external'::text AS src,
           COUNT(*)::bigint AS c,
           COALESCE(SUM((d.amount)::numeric), 0) AS amt
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND (d.is_external IS TRUE OR d.sender_id IS NULL OR d.recipient_id IS NULL)
    GROUP BY UPPER(d.token_symbol)
  ),
  -- Wallet transfers theo hướng (in cho received, out cho sent)
  transfers_agg AS (
    SELECT UPPER(wt.token_symbol) AS sym, 'wallet_transfers'::text AS src,
           COUNT(*)::bigint AS c,
           COALESCE(SUM(wt.amount), 0) AS amt
    FROM wallet_transfers wt
    WHERE wt.status = 'confirmed'
      AND ((p_direction = 'received' AND wt.direction = 'in')
        OR (p_direction = 'sent' AND wt.direction = 'out'))
    GROUP BY UPPER(wt.token_symbol)
  ),
  -- Swaps: sent = from_symbol (token đem bán), received = to_symbol (token nhận về)
  swaps_agg AS (
    SELECT
      CASE WHEN p_direction = 'sent' THEN UPPER(s.from_symbol) ELSE UPPER(s.to_symbol) END AS sym,
      'swaps'::text AS src,
      COUNT(*)::bigint AS c,
      COALESCE(SUM(CASE WHEN p_direction = 'sent' THEN s.from_amount ELSE s.to_amount END), 0) AS amt
    FROM swap_transactions s
    WHERE s.status = 'confirmed'
    GROUP BY
      CASE WHEN p_direction = 'sent' THEN UPPER(s.from_symbol) ELSE UPPER(s.to_symbol) END
  ),
  unioned AS (
    SELECT * FROM donations_internal
    UNION ALL SELECT * FROM donations_external
    UNION ALL SELECT * FROM transfers_agg
    UNION ALL SELECT * FROM swaps_agg
  )
  SELECT u.sym, u.src, u.c, u.amt, (u.amt * COALESCE(p.price, 0))::numeric
  FROM unioned u
  LEFT JOIN price_of p ON p.sym = u.sym
  WHERE u.sym IS NOT NULL
  ORDER BY (u.amt * COALESCE(p.price, 0)) DESC NULLS LAST, u.c DESC
  LIMIT 200;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_global_wallet_flow_breakdown(text, jsonb) TO anon, authenticated, service_role;