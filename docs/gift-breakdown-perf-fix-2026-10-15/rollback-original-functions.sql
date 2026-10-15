CREATE OR REPLACE FUNCTION public.get_global_gift_breakdown(p_direction text)
 RETURNS TABLE(token_symbol text, source text, count bigint, total_amount numeric, usd_value numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_global_gift_breakdown(p_direction, NULL::jsonb);
$function$;

CREATE OR REPLACE FUNCTION public.get_global_gift_breakdown(p_direction text, p_prices jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(token_symbol text, source text, count bigint, total_amount numeric, usd_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH external_prices AS (
    SELECT sym, price FROM public.normalize_price_map(p_prices)
  ),
  donations_agg AS (
    SELECT public.normalize_price_symbol(d.token_symbol) AS sym, 'donations'::text AS src,
           COUNT(*)::bigint AS c,
           COALESCE(SUM((d.amount)::numeric), 0) AS amt
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
    GROUP BY public.normalize_price_symbol(d.token_symbol)
  ),
  resolved AS (
    SELECT da.sym, da.src, da.c, da.amt,
           COALESCE(e.price, public.get_token_price_now(da.sym)) AS price
    FROM donations_agg da
    LEFT JOIN external_prices e ON e.sym = da.sym
  )
  SELECT r.sym, r.src, r.c, r.amt, (r.amt * COALESCE(r.price, 0))::numeric
  FROM resolved r
  WHERE r.sym IS NOT NULL AND r.sym <> ''
  ORDER BY (r.amt * COALESCE(r.price, 0)) DESC NULLS LAST, r.c DESC
  LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_global_wallet_flow_breakdown(p_direction text, p_prices jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(token_symbol text, source text, count bigint, total_amount numeric, usd_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH external_prices AS (
    SELECT sym, price FROM public.normalize_price_map(p_prices)
  ),
  donations_internal AS (
    SELECT public.normalize_price_symbol(d.token_symbol) AS sym, 'donations_internal'::text AS src,
           COUNT(*)::bigint AS c,
           COALESCE(SUM((d.amount)::numeric), 0) AS amt
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
    GROUP BY public.normalize_price_symbol(d.token_symbol)
  ),
  donations_external AS (
    SELECT public.normalize_price_symbol(d.token_symbol) AS sym, 'donations_external'::text AS src,
           COUNT(*)::bigint AS c,
           COALESCE(SUM((d.amount)::numeric), 0) AS amt
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND (d.is_external IS TRUE OR d.sender_id IS NULL OR d.recipient_id IS NULL)
    GROUP BY public.normalize_price_symbol(d.token_symbol)
  ),
  transfers_agg AS (
    SELECT public.normalize_price_symbol(wt.token_symbol) AS sym, 'wallet_transfers'::text AS src,
           COUNT(*)::bigint AS c,
           COALESCE(SUM(wt.amount), 0) AS amt
    FROM wallet_transfers wt
    WHERE wt.status = 'confirmed'
      AND ((p_direction = 'received' AND wt.direction = 'in')
        OR (p_direction = 'sent' AND wt.direction = 'out'))
    GROUP BY public.normalize_price_symbol(wt.token_symbol)
  ),
  swaps_agg AS (
    SELECT
      CASE WHEN p_direction = 'sent' THEN public.normalize_price_symbol(s.from_symbol)
           ELSE public.normalize_price_symbol(s.to_symbol) END AS sym,
      'swaps'::text AS src,
      COUNT(*)::bigint AS c,
      COALESCE(SUM(CASE WHEN p_direction = 'sent' THEN s.from_amount ELSE s.to_amount END), 0) AS amt
    FROM swap_transactions s
    WHERE s.status = 'confirmed'
    GROUP BY
      CASE WHEN p_direction = 'sent' THEN public.normalize_price_symbol(s.from_symbol)
           ELSE public.normalize_price_symbol(s.to_symbol) END
  ),
  unioned AS (
    SELECT * FROM donations_internal
    UNION ALL SELECT * FROM donations_external
    UNION ALL SELECT * FROM transfers_agg
    UNION ALL SELECT * FROM swaps_agg
  ),
  resolved AS (
    SELECT u.sym, u.src, u.c, u.amt,
           COALESCE(e.price, public.get_token_price_now(u.sym)) AS price
    FROM unioned u
    LEFT JOIN external_prices e ON e.sym = u.sym
  )
  SELECT r.sym, r.src, r.c, r.amt, (r.amt * COALESCE(r.price, 0))::numeric
  FROM resolved r
  WHERE r.sym IS NOT NULL AND r.sym <> ''
  ORDER BY (r.amt * COALESCE(r.price, 0)) DESC NULLS LAST, r.c DESC
  LIMIT 200;
END;
$function$;
