CREATE OR REPLACE FUNCTION public.get_app_stats(p_prices jsonb)
 RETURNS TABLE(total_users bigint, total_posts bigint, total_photos bigint, total_videos bigint, total_livestreams bigint, total_rewards numeric, treasury_camly_received numeric, total_camly_claimed numeric, total_videos_combined bigint, total_sent_usd numeric, total_received_usd numeric, unpriced_symbols text[], skipped_symbols text[], priced_coverage_pct numeric)
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

  WITH external_prices AS (
    SELECT sym, price FROM public.normalize_price_map(p_prices)
  ),
  donations_agg AS (
    -- SSOT 2026-10-15: doc tu gift_breakdown_cache (cung nguon voi Gift history),
    -- dinh nghia dong nhat ban goc: confirmed + noi bo + du 2 dau + amount hop le.
    SELECT gbc.token_symbol AS sym, gbc.total_amount AS amt, gbc.tx_count AS rows_cnt
    FROM public.gift_breakdown_cache gbc
    WHERE gbc.source = 'donations_internal'
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
