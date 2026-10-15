-- Rewrite the two global breakdown RPCs to read the pre-aggregated cache.
-- Signatures, return shapes, price resolution and ordering are unchanged.
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
  resolved AS (
    SELECT c.token_symbol AS sym, 'donations'::text AS src, c.tx_count AS cnt, c.total_amount AS amt,
           COALESCE(e.price, public.get_token_price_now(c.token_symbol)) AS price
    FROM public.gift_breakdown_cache c
    LEFT JOIN external_prices e ON e.sym = c.token_symbol
    WHERE c.source = 'donations_internal'
  )
  SELECT r.sym, r.src, r.cnt, r.amt, (r.amt * COALESCE(r.price, 0))::numeric
  FROM resolved r
  WHERE r.sym IS NOT NULL AND r.sym <> ''
  ORDER BY (r.amt * COALESCE(r.price, 0)) DESC NULLS LAST, r.cnt DESC
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
  unioned AS (
    SELECT c.token_symbol AS sym, c.source AS src, c.tx_count AS cnt, c.total_amount AS amt
    FROM public.gift_breakdown_cache c
    WHERE c.source IN ('donations_internal', 'donations_external')
       OR (c.source = 'wallet_transfers' AND c.direction = p_direction)
       OR (c.source = 'swaps' AND c.direction = CASE WHEN p_direction = 'sent' THEN 'sent' ELSE 'received' END)
  ),
  resolved AS (
    SELECT u.sym, u.src, u.cnt, u.amt,
           COALESCE(e.price, public.get_token_price_now(u.sym)) AS price
    FROM unioned u
    LEFT JOIN external_prices e ON e.sym = u.sym
  )
  SELECT r.sym, r.src, r.cnt, r.amt, (r.amt * COALESCE(r.price, 0))::numeric
  FROM resolved r
  WHERE r.sym IS NOT NULL AND r.sym <> ''
  ORDER BY (r.amt * COALESCE(r.price, 0)) DESC NULLS LAST, r.cnt DESC
  LIMIT 200;
END;
$function$;
