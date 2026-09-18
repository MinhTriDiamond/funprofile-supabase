
-- 1) get_app_stats: thêm tham số p_prices JSONB
CREATE OR REPLACE FUNCTION public.get_app_stats(p_prices jsonb DEFAULT NULL)
 RETURNS TABLE(total_users bigint, total_posts bigint, total_photos bigint, total_videos bigint, total_livestreams bigint, total_rewards numeric, treasury_camly_received numeric, total_camly_claimed numeric, total_videos_combined bigint, total_sent_usd numeric, total_received_usd numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_date CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+00';
  v_total_users BIGINT;
  v_total_posts BIGINT;
  v_total_photos BIGINT;
  v_total_videos BIGINT;
  v_total_livestreams BIGINT;
  v_total_rewards NUMERIC;
  v_treasury NUMERIC;
  v_claimed NUMERIC;
  v_user_count BIGINT;
  v_old_reward NUMERIC;
  v_new_reward NUMERIC;
  v_videos_combined BIGINT;
  v_sent_usd NUMERIC;
  v_received_usd NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM profiles WHERE is_banned = false;

  SELECT COUNT(*) INTO v_total_posts FROM posts
  WHERE (post_type IS NULL OR post_type NOT IN ('gift_celebration'));

  SELECT COUNT(*) INTO v_total_photos FROM posts
  WHERE (image_url IS NOT NULL OR (media_urls IS NOT NULL AND media_urls::text <> '[]'))
    AND video_url IS NULL
    AND (post_type IS NULL OR post_type NOT IN ('video', 'gift_celebration'));

  SELECT COUNT(*) INTO v_total_videos FROM posts
  WHERE video_url IS NOT NULL
    AND (post_type IS NULL OR post_type NOT IN ('live', 'gift_celebration'));

  SELECT COUNT(*) INTO v_total_livestreams FROM live_sessions WHERE status = 'ended';

  v_videos_combined := v_total_posts + v_total_livestreams;

  SELECT COALESCE(SUM(amount), 0) INTO v_treasury FROM reward_claims;
  v_claimed := v_treasury;
  SELECT COUNT(*) INTO v_user_count FROM profiles;

  SELECT COALESCE(SUM(sub.reward), 0) INTO v_old_reward
  FROM (
    SELECT user_id, COUNT(*) * 10000 AS reward
    FROM posts WHERE created_at < cutoff_date AND COALESCE(is_reward_eligible, true) = true
    AND (post_type IS NULL OR post_type <> 'gift_celebration')
    GROUP BY user_id
    UNION ALL
    SELECT po.user_id, COUNT(*) * 1000 AS reward
    FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE r.created_at < cutoff_date GROUP BY po.user_id
    UNION ALL
    SELECT po.user_id, COUNT(*) * 2000 AS reward
    FROM comments c INNER JOIN posts po ON c.post_id = po.id WHERE c.created_at < cutoff_date GROUP BY po.user_id
    UNION ALL
    SELECT po.user_id, COUNT(*) * 10000 AS reward
    FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE sp.created_at < cutoff_date GROUP BY po.user_id
    UNION ALL
    SELECT user_id, COUNT(*) * 10000 AS reward
    FROM (
      SELECT user_id FROM friendships WHERE status = 'accepted' AND created_at < cutoff_date
      UNION ALL
      SELECT friend_id AS user_id FROM friendships WHERE status = 'accepted' AND created_at < cutoff_date
    ) f GROUP BY user_id
  ) sub;

  SELECT COALESCE(SUM(sub.reward), 0) INTO v_new_reward
  FROM (
    SELECT SUM(LEAST(cnt, 10)) * 5000 AS reward
    FROM (SELECT user_id, (created_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt FROM posts WHERE created_at >= cutoff_date AND COALESCE(is_reward_eligible, true) = true AND (post_type IS NULL OR post_type <> 'gift_celebration') GROUP BY user_id, (created_at AT TIME ZONE 'UTC')::DATE) x
    UNION ALL
    SELECT SUM(LEAST(cnt, 50)) * 1000 AS reward
    FROM (SELECT po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE r.created_at >= cutoff_date GROUP BY po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE) x
    UNION ALL
    SELECT SUM(LEAST(cnt, 50)) * 1000 AS reward
    FROM (SELECT po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt FROM comments c INNER JOIN posts po ON c.post_id = po.id WHERE c.created_at >= cutoff_date AND length(c.content) > 20 GROUP BY po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE) x
    UNION ALL
    SELECT SUM(LEAST(cnt, 10)) * 1000 AS reward
    FROM (SELECT po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE sp.created_at >= cutoff_date GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE) x
    UNION ALL
    SELECT SUM(LEAST(cnt, 10)) * 10000 AS reward
    FROM (SELECT user_id, reward_date AS d, COUNT(*) AS cnt FROM (SELECT user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date FROM friendships WHERE status = 'accepted' AND created_at >= cutoff_date UNION ALL SELECT friend_id, (created_at AT TIME ZONE 'UTC')::DATE FROM friendships WHERE status = 'accepted' AND created_at >= cutoff_date) f GROUP BY user_id, reward_date) x
    UNION ALL
    SELECT SUM(LEAST(cnt, 5)) * 20000 AS reward
    FROM (SELECT user_id, (started_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt FROM livestreams WHERE started_at >= cutoff_date AND is_eligible = true GROUP BY user_id, (started_at AT TIME ZONE 'UTC')::DATE) x
  ) sub;

  v_total_rewards := (v_user_count * 50000) + v_old_reward + v_new_reward;

  -- USD totals: ưu tiên giá real-time từ p_prices, fallback bảng tham chiếu
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
  sent AS (
    SELECT COALESCE(SUM((d.amount)::numeric * COALESCE(p.price, 0)), 0) AS usd
    FROM donations d
    LEFT JOIN price_of p ON p.sym = UPPER(d.token_symbol)
    WHERE d.status = 'confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
  ),
  sent_wt AS (
    SELECT COALESCE(SUM(wt.amount * COALESCE(p.price, 0)), 0) AS usd
    FROM wallet_transfers wt
    LEFT JOIN price_of p ON p.sym = UPPER(wt.token_symbol)
    WHERE wt.direction = 'out' AND wt.status IN ('confirmed','success')
  ),
  sent_sw AS (
    SELECT COALESCE(SUM(sw.from_amount * COALESCE(p.price, 0)), 0) AS usd
    FROM swap_transactions sw
    LEFT JOIN price_of p ON p.sym = UPPER(sw.from_symbol)
    WHERE sw.status IN ('confirmed','success','completed')
  ),
  recv AS (
    SELECT COALESCE(SUM((d.amount)::numeric * COALESCE(p.price, 0)), 0) AS usd
    FROM donations d
    LEFT JOIN price_of p ON p.sym = UPPER(d.token_symbol)
    WHERE d.status = 'confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
  ),
  recv_wt AS (
    SELECT COALESCE(SUM(wt.amount * COALESCE(p.price, 0)), 0) AS usd
    FROM wallet_transfers wt
    LEFT JOIN price_of p ON p.sym = UPPER(wt.token_symbol)
    WHERE wt.direction = 'in' AND wt.status IN ('confirmed','success')
  )
  SELECT
    (SELECT usd FROM sent) + (SELECT usd FROM sent_wt) + (SELECT usd FROM sent_sw),
    (SELECT usd FROM recv) + (SELECT usd FROM recv_wt)
  INTO v_sent_usd, v_received_usd;

  RETURN QUERY SELECT
    v_total_users, v_total_posts, v_total_photos, v_total_videos, v_total_livestreams,
    v_total_rewards, v_treasury, v_claimed,
    v_videos_combined, v_sent_usd, v_received_usd;
END;
$function$;

-- 2) get_global_gift_breakdown: thêm tham số p_prices JSONB
CREATE OR REPLACE FUNCTION public.get_global_gift_breakdown(p_direction text, p_prices jsonb DEFAULT NULL)
 RETURNS TABLE(token_symbol text, source text, count bigint, total_amount numeric, usd_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_sent BOOLEAN := (p_direction = 'sent');
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
    WHERE d.status = 'confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
    GROUP BY UPPER(d.token_symbol)
  ),
  wt_agg AS (
    SELECT UPPER(wt.token_symbol) AS sym, 'transfers'::text AS src,
           COUNT(*)::bigint AS c,
           COALESCE(SUM(wt.amount), 0) AS amt
    FROM wallet_transfers wt
    WHERE wt.direction = CASE WHEN is_sent THEN 'out' ELSE 'in' END
      AND wt.status IN ('confirmed','success')
    GROUP BY UPPER(wt.token_symbol)
  ),
  sw_agg AS (
    SELECT UPPER(sw.from_symbol) AS sym, 'swaps'::text AS src,
           COUNT(*)::bigint AS c,
           COALESCE(SUM(sw.from_amount), 0) AS amt
    FROM swap_transactions sw
    WHERE is_sent = true AND sw.status IN ('confirmed','success','completed')
    GROUP BY UPPER(sw.from_symbol)
  ),
  combined AS (
    SELECT * FROM donations_agg
    UNION ALL SELECT * FROM wt_agg
    UNION ALL SELECT * FROM sw_agg
  )
  SELECT c.sym, c.src, c.c, c.amt, (c.amt * COALESCE(p.price, 0))::numeric
  FROM combined c
  LEFT JOIN price_of p ON p.sym = c.sym
  WHERE c.sym IS NOT NULL
  ORDER BY (c.amt * COALESCE(p.price, 0)) DESC NULLS LAST, c.c DESC
  LIMIT 50;
END;
$function$;
