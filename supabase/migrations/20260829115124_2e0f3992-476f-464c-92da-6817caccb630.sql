CREATE OR REPLACE FUNCTION public.normalize_price_map(p_prices jsonb)
RETURNS TABLE(sym text, price numeric)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT x.sym, MAX(x.price) AS price
  FROM (
    SELECT public.normalize_price_symbol(key) AS sym,
           NULLIF(value, 'null')::numeric AS price
    FROM jsonb_each_text(COALESCE(p_prices, '{}'::jsonb))
  ) x
  WHERE x.price IS NOT NULL AND x.sym <> ''
  GROUP BY x.sym
$$;

GRANT EXECUTE ON FUNCTION public.normalize_price_map(jsonb) TO anon, authenticated, service_role;