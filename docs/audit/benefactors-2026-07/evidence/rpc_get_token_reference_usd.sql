pg_get_functiondef
CREATE OR REPLACE FUNCTION public.get_token_reference_usd(p_symbol text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF upper(p_symbol) = 'FUN' THEN
    RETURN NULL;  -- FUN testnet: không có tỷ giá USD
  END IF;
  RETURN CASE upper(p_symbol)
    WHEN 'CAMLY' THEN 0.000014
    WHEN 'BTC'   THEN 100000
    WHEN 'BTCB'  THEN 100000
    WHEN 'BNB'   THEN 700
    WHEN 'USDT'  THEN 1
    WHEN 'USDC'  THEN 1
    WHEN 'ETH'   THEN 3500
    WHEN 'POL'   THEN 0.5
    ELSE NULL
  END::NUMERIC;
END;
$function$

(1 row)
