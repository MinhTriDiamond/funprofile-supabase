-- B2: get_app_stats dùng SSOT giá (token_price_current) thay hardcode
CREATE OR REPLACE FUNCTION public.get_token_price_now(p_symbol text)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT price_usd
  FROM public.token_price_current
  WHERE symbol = public.normalize_price_symbol(p_symbol)
    AND fetched_at > now() - interval '60 minutes'
$function$;

DROP FUNCTION IF EXISTS public.get_app_stats(jsonb);
DROP FUNCTION IF EXISTS public.get_app_stats();

CREATE FUNCTION public.get_app_stats(p_prices jsonb DEFAULT NULL::jsonb)
RETURNS TABLE(
  total_users bigint, total_posts bigint, total_photos bigint, total_videos bigint,
  total_livestreams bigint, total_rewards numeric, treasury_camly_received numeric,
  total_camly_claimed numeric, total_videos_combined bigint,
  total_sent_usd numeric, total_received_usd numeric,
  unpriced_symbols text[], skipped_symbols text[], priced_coverage_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c app_stats_cache%ROWTYPE;
  v_internal_usd NUMERIC := 0;
  v_unpriced TEXT[] := '{}';
  v_skipped TEXT[] := '{}';
  v_coverage NUMERIC := 100;
  v_rows_total BIGINT := 0;
  v_rows_priced BIGINT := 0;
BEGIN
  SELECT * INTO c FROM app_stats_cache WHERE id = 1;
  IF NOT FOUND THEN
    PERFORM refresh_app_stats_cache();
    SELECT * INTO c FROM app_stats_cache WHERE id = 1;
  END IF;

  -- Sent USD == Received USD: chỉ tính quà nội bộ thật giữa user với user.
  WITH external_prices AS (
    SELECT public.normalize_price_symbol(key) AS sym, NULLIF(value, 'null')::numeric AS price
    FROM jsonb_each_text(COALESCE(p_prices, '{}'::jsonb))
  ),
  donations_agg AS (
    SELECT public.normalize_price_symbol(d.token_symbol) AS sym,
           COALESCE(SUM((d.amount)::numeric), 0) AS amt,
           COUNT(*) AS rows_cnt
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
    GROUP BY public.normalize_price_symbol(d.token_symbol)
  ),
  resolved AS (
    SELECT da.sym, da.amt, da.rows_cnt,
           COALESCE(e.price, public.get_token_price_now(da.sym)) AS price
    FROM donations_agg da
    LEFT JOIN external_prices e ON e.sym = da.sym
  )
  SELECT
    COALESCE(SUM(CASE WHEN r.price IS NOT NULL THEN r.amt * r.price ELSE 0 END), 0),
    COALESCE(ARRAY_AGG(DISTINCT r.sym) FILTER (WHERE r.price IS NULL AND r.sym <> 'FUN'), '{}'),
    COALESCE(ARRAY_AGG(DISTINCT r.sym) FILTER (WHERE r.sym = 'FUN'), '{}'),
    COALESCE(SUM(r.rows_cnt), 0),
    COALESCE(SUM(r.rows_cnt) FILTER (WHERE r.price IS NOT NULL OR r.sym = 'FUN'), 0)
  INTO v_internal_usd, v_unpriced, v_skipped, v_rows_total, v_rows_priced
  FROM resolved r;

  IF v_rows_total > 0 THEN
    v_coverage := ROUND((v_rows_priced::numeric / v_rows_total::numeric) * 100, 2);
  END IF;

  RETURN QUERY SELECT
    c.total_users, c.total_posts, c.total_photos, c.total_videos, c.total_livestreams,
    c.total_rewards, c.treasury_camly_received, c.total_camly_claimed,
    c.total_videos_combined, v_internal_usd, v_internal_usd,
    v_unpriced, v_skipped, v_coverage;
END;
$function$;

CREATE FUNCTION public.get_app_stats()
RETURNS TABLE(
  total_users bigint, total_posts bigint, total_photos bigint, total_videos bigint,
  total_livestreams bigint, total_rewards numeric, treasury_camly_received numeric,
  total_camly_claimed numeric, total_videos_combined bigint,
  total_sent_usd numeric, total_received_usd numeric,
  unpriced_symbols text[], skipped_symbols text[], priced_coverage_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_app_stats(NULL::jsonb)
$function$;

GRANT EXECUTE ON FUNCTION public.get_app_stats(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_app_stats() TO anon, authenticated, service_role;