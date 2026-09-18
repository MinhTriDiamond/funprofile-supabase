-- 1. get_app_stats(p_prices) dùng helper normalize_price_map
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

-- 2. get_global_gift_breakdown: helper + SSOT, bỏ fallback_prices hardcode
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

-- 3. get_global_wallet_flow_breakdown: helper + SSOT, bỏ fallback_prices, TON/TONCOIN có giá
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