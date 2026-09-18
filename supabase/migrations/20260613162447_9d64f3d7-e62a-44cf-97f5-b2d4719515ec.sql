-- Fix get_global_gift_breakdown: chỉ tính gift nội bộ (loại ví ngoài, bỏ wallet_transfers + swaps)

CREATE OR REPLACE FUNCTION public.get_global_gift_breakdown(p_direction text, p_prices jsonb DEFAULT NULL::jsonb)
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
  donations_agg AS (
    SELECT UPPER(d.token_symbol) AS sym, 'donations'::text AS src,
           COUNT(*)::bigint AS c,
           COALESCE(SUM((d.amount)::numeric), 0) AS amt
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
    GROUP BY UPPER(d.token_symbol)
  )
  SELECT da.sym, da.src, da.c, da.amt, (da.amt * COALESCE(p.price, 0))::numeric
  FROM donations_agg da
  LEFT JOIN price_of p ON p.sym = da.sym
  WHERE da.sym IS NOT NULL
  ORDER BY (da.amt * COALESCE(p.price, 0)) DESC NULLS LAST, da.c DESC
  LIMIT 50;
END;
$function$;

-- Backward-compat: bản 1 tham số gọi sang bản 2 tham số
CREATE OR REPLACE FUNCTION public.get_global_gift_breakdown(p_direction text)
RETURNS TABLE(token_symbol text, source text, count bigint, total_amount numeric, usd_value numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.get_global_gift_breakdown(p_direction, NULL::jsonb);
$$;