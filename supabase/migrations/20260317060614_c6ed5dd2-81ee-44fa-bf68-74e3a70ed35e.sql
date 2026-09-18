CREATE OR REPLACE FUNCTION public.get_gift_day_token_totals()
RETURNS TABLE(vn_date date, token_symbol text, total_amount numeric, tx_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS vn_date,
    d.token_symbol,
    SUM(d.amount::numeric) AS total_amount,
    COUNT(*) AS tx_count
  FROM public.donations d
  WHERE d.status = 'confirmed'
    AND d.created_at >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh' - interval '7 days')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
  GROUP BY vn_date, d.token_symbol
  ORDER BY vn_date DESC, d.token_symbol;
$$;