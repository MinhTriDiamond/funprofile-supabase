CREATE OR REPLACE FUNCTION public.get_user_gift_breakdown(p_user_id uuid, p_direction text, p_prices jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(token_symbol text, cnt bigint, total_amount numeric, price_usd numeric, usd_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH raw AS (
    SELECT
      CASE WHEN upper(coalesce(d.token_symbol, 'UNKNOWN')) = 'BNB'
           THEN CASE WHEN d.chain_id = 97 THEN 'BNB (BSC Testnet)' ELSE 'BNB (BSC Chain)' END
           ELSE upper(coalesce(d.token_symbol, 'UNKNOWN')) END AS label,
      public._safe_numeric(d.amount::text) AS amt,
      d.amount_usd AS usd
    FROM public.donations d
    WHERE d.status = 'confirmed'
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND ((p_direction = 'sent' AND d.sender_id = p_user_id)
        OR (p_direction = 'received' AND d.recipient_id = p_user_id))
  ),
  agg AS (
    SELECT label,
           count(*)::bigint AS cnt,
           sum(coalesce(amt, 0)) AS total_amount,
           sum(usd) AS usd_value
    FROM raw
    GROUP BY label
  )
  SELECT
    a.label AS token_symbol,
    a.cnt,
    a.total_amount,
    CASE WHEN a.usd_value IS NULL OR a.total_amount IS NULL OR a.total_amount = 0
         THEN NULL ELSE a.usd_value / a.total_amount END AS price_usd,
    a.usd_value
  FROM agg a
  ORDER BY (CASE WHEN a.usd_value IS NULL THEN 0 ELSE a.usd_value END) DESC, a.cnt DESC;
$function$;