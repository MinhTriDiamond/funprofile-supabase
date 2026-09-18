DROP FUNCTION IF EXISTS public.get_gift_day_token_totals();

CREATE OR REPLACE FUNCTION public.get_gift_day_token_totals()
RETURNS TABLE(vn_date date, token_symbol text, chain_id integer, total_amount numeric, tx_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    (d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS vn_date,
    d.token_symbol,
    d.chain_id,
    SUM(d.amount::numeric) AS total_amount,
    COUNT(*) AS tx_count
  FROM public.donations d
  WHERE d.status = 'confirmed'
    AND (
      (d.is_external IS NOT TRUE AND d.sender_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.external_wallet_inclusion_overrides o
                 WHERE o.user_id = d.recipient_id OR o.user_id = d.sender_id)
    )
    AND d.created_at >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh' - interval '7 days')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
  GROUP BY vn_date, d.token_symbol, d.chain_id
  ORDER BY vn_date DESC, d.token_symbol;
$function$;