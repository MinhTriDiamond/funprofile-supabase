
-- Cache table for Honor Board stats
CREATE TABLE IF NOT EXISTS public.app_stats_cache (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_users BIGINT NOT NULL DEFAULT 0,
  total_posts BIGINT NOT NULL DEFAULT 0,
  total_photos BIGINT NOT NULL DEFAULT 0,
  total_videos BIGINT NOT NULL DEFAULT 0,
  total_livestreams BIGINT NOT NULL DEFAULT 0,
  total_videos_combined BIGINT NOT NULL DEFAULT 0,
  total_rewards NUMERIC NOT NULL DEFAULT 0,
  treasury_camly_received NUMERIC NOT NULL DEFAULT 0,
  total_camly_claimed NUMERIC NOT NULL DEFAULT 0,
  sent_token_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_token_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_stats_cache TO anon, authenticated;
GRANT ALL ON public.app_stats_cache TO service_role;

ALTER TABLE public.app_stats_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read app stats cache" ON public.app_stats_cache;
CREATE POLICY "Anyone can read app stats cache" ON public.app_stats_cache FOR SELECT USING (true);

-- Heavy refresh job (runs from pg_cron every 5 minutes)
CREATE OR REPLACE FUNCTION public.refresh_app_stats_cache()
RETURNS void
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
  v_sent JSONB;
  v_recv JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM profiles WHERE is_banned = false;
  SELECT COUNT(*) INTO v_total_posts FROM posts WHERE deleted_at IS NULL AND (post_type IS NULL OR post_type <> 'gift_celebration');
  SELECT COUNT(*) INTO v_total_photos FROM posts WHERE deleted_at IS NULL AND media_urls IS NOT NULL AND jsonb_array_length(media_urls) > 0;
  SELECT COUNT(*) INTO v_total_videos FROM posts WHERE deleted_at IS NULL AND video_url IS NOT NULL;
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
    SELECT SUM(LEAST(cnt, 5)) * 10000 AS reward
    FROM (SELECT user_id, (started_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt FROM livestreams WHERE started_at >= cutoff_date AND is_eligible = true GROUP BY user_id, (started_at AT TIME ZONE 'UTC')::DATE) x
  ) sub;

  v_total_rewards := (v_user_count * 50000) + v_old_reward + v_new_reward;

  -- Per-token totals as JSONB (sym -> amount)
  WITH all_sent AS (
    SELECT UPPER(d.token_symbol) AS sym, SUM((d.amount)::numeric) AS amt
    FROM donations d
    WHERE d.status = 'confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]+)?$' AND d.token_symbol IS NOT NULL
    GROUP BY UPPER(d.token_symbol)
    UNION ALL
    SELECT UPPER(wt.token_symbol), SUM(wt.amount)
    FROM wallet_transfers wt
    WHERE wt.direction = 'out' AND wt.status IN ('confirmed','success') AND wt.token_symbol IS NOT NULL
    GROUP BY UPPER(wt.token_symbol)
    UNION ALL
    SELECT UPPER(sw.from_symbol), SUM(sw.from_amount)
    FROM swap_transactions sw
    WHERE sw.status IN ('confirmed','success','completed') AND sw.from_symbol IS NOT NULL
    GROUP BY UPPER(sw.from_symbol)
  )
  SELECT COALESCE(jsonb_object_agg(sym, total), '{}'::jsonb) INTO v_sent
  FROM (SELECT sym, SUM(amt) AS total FROM all_sent GROUP BY sym) z;

  WITH all_recv AS (
    SELECT UPPER(d.token_symbol) AS sym, SUM((d.amount)::numeric) AS amt
    FROM donations d
    WHERE d.status = 'confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]+)?$' AND d.token_symbol IS NOT NULL
    GROUP BY UPPER(d.token_symbol)
    UNION ALL
    SELECT UPPER(wt.token_symbol), SUM(wt.amount)
    FROM wallet_transfers wt
    WHERE wt.direction = 'in' AND wt.status IN ('confirmed','success') AND wt.token_symbol IS NOT NULL
    GROUP BY UPPER(wt.token_symbol)
  )
  SELECT COALESCE(jsonb_object_agg(sym, total), '{}'::jsonb) INTO v_recv
  FROM (SELECT sym, SUM(amt) AS total FROM all_recv GROUP BY sym) z;

  INSERT INTO app_stats_cache (
    id, total_users, total_posts, total_photos, total_videos, total_livestreams,
    total_videos_combined, total_rewards, treasury_camly_received, total_camly_claimed,
    sent_token_totals, received_token_totals, refreshed_at
  ) VALUES (
    1, v_total_users, v_total_posts, v_total_photos, v_total_videos, v_total_livestreams,
    v_videos_combined, v_total_rewards, v_treasury, v_claimed,
    v_sent, v_recv, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    total_users = EXCLUDED.total_users,
    total_posts = EXCLUDED.total_posts,
    total_photos = EXCLUDED.total_photos,
    total_videos = EXCLUDED.total_videos,
    total_livestreams = EXCLUDED.total_livestreams,
    total_videos_combined = EXCLUDED.total_videos_combined,
    total_rewards = EXCLUDED.total_rewards,
    treasury_camly_received = EXCLUDED.treasury_camly_received,
    total_camly_claimed = EXCLUDED.total_camly_claimed,
    sent_token_totals = EXCLUDED.sent_token_totals,
    received_token_totals = EXCLUDED.received_token_totals,
    refreshed_at = EXCLUDED.refreshed_at;
END;
$function$;

-- Replace get_app_stats: read from cache, apply prices on the fly (fast)
CREATE OR REPLACE FUNCTION public.get_app_stats(p_prices jsonb DEFAULT NULL::jsonb)
RETURNS TABLE(
  total_users bigint, total_posts bigint, total_photos bigint, total_videos bigint,
  total_livestreams bigint, total_rewards numeric, treasury_camly_received numeric,
  total_camly_claimed numeric, total_videos_combined bigint, total_sent_usd numeric, total_received_usd numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c app_stats_cache%ROWTYPE;
  v_sent_usd NUMERIC := 0;
  v_recv_usd NUMERIC := 0;
BEGIN
  SELECT * INTO c FROM app_stats_cache WHERE id = 1;
  IF NOT FOUND THEN
    PERFORM refresh_app_stats_cache();
    SELECT * INTO c FROM app_stats_cache WHERE id = 1;
  END IF;

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
  )
  SELECT
    COALESCE(SUM((s.value)::numeric * COALESCE(p.price, 0)), 0),
    COALESCE(SUM((r.value)::numeric * COALESCE(pr.price, 0)), 0)
  INTO v_sent_usd, v_recv_usd
  FROM (
    SELECT
      (SELECT COALESCE(SUM((kv.value)::numeric * COALESCE(po.price, 0)), 0)
       FROM jsonb_each_text(c.sent_token_totals) kv
       LEFT JOIN price_of po ON po.sym = kv.key) AS sent_total,
      (SELECT COALESCE(SUM((kv.value)::numeric * COALESCE(po.price, 0)), 0)
       FROM jsonb_each_text(c.received_token_totals) kv
       LEFT JOIN price_of po ON po.sym = kv.key) AS recv_total
  ) agg
  LEFT JOIN LATERAL (SELECT agg.sent_total AS value) s ON true
  LEFT JOIN LATERAL (SELECT agg.recv_total AS value) r ON true
  LEFT JOIN price_of p ON false
  LEFT JOIN price_of pr ON false;

  -- Simpler: direct calc
  SELECT
    COALESCE(SUM((kv.value)::numeric * COALESCE(po.price, 0)), 0)
  INTO v_sent_usd
  FROM jsonb_each_text(c.sent_token_totals) kv
  LEFT JOIN (
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
    )
    SELECT COALESCE(f.sym, e.sym) AS sym, COALESCE(e.price, f.price, 0) AS price
    FROM fallback_prices f FULL OUTER JOIN external_prices e ON e.sym = f.sym
  ) po ON po.sym = kv.key;

  SELECT
    COALESCE(SUM((kv.value)::numeric * COALESCE(po.price, 0)), 0)
  INTO v_recv_usd
  FROM jsonb_each_text(c.received_token_totals) kv
  LEFT JOIN (
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
    )
    SELECT COALESCE(f.sym, e.sym) AS sym, COALESCE(e.price, f.price, 0) AS price
    FROM fallback_prices f FULL OUTER JOIN external_prices e ON e.sym = f.sym
  ) po ON po.sym = kv.key;

  RETURN QUERY SELECT
    c.total_users, c.total_posts, c.total_photos, c.total_videos, c.total_livestreams,
    c.total_rewards, c.treasury_camly_received, c.total_camly_claimed,
    c.total_videos_combined, v_sent_usd, v_recv_usd;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refresh_app_stats_cache() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_app_stats(jsonb) TO anon, authenticated, service_role;
