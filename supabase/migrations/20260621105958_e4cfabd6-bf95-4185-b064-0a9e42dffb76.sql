
-- Recipient leaderboard: include ALL on-chain receipts to real users
CREATE OR REPLACE FUNCTION public.get_recipient_leaderboard(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_time_range text DEFAULT 'all', p_token_symbol text DEFAULT NULL, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
RETURNS TABLE(user_id uuid, username text, avatar_url text, full_name text, token_symbol text, total_amount numeric, total_transactions bigint, includes_external boolean, rank bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_since timestamptz; v_until timestamptz;
BEGIN
  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from; v_until := p_to;
  ELSE
    v_until := NULL;
    v_since := CASE p_time_range
      WHEN 'day' THEN now() - interval '1 day'
      WHEN 'week' THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL END;
  END IF;
  RETURN QUERY
  WITH agg AS (
    SELECT d.recipient_id AS uid, d.token_symbol AS sym,
      SUM(d.amount::numeric) AS total_amt,
      COUNT(DISTINCT d.tx_hash) AS total_tx,
      bool_or(d.is_external = true OR d.leaderboard_eligibility IN ('external_to_father','external_excluded')) AS has_ext
    FROM donations d
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.recipient_id IS NOT NULL
      AND d.leaderboard_eligibility IN ('internal','external_to_father','external_excluded')
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
      AND (p_token_symbol IS NULL OR d.token_symbol = p_token_symbol)
    GROUP BY d.recipient_id, d.token_symbol
  )
  SELECT a.uid, p.username, p.avatar_url, p.full_name,
    a.sym, a.total_amt, a.total_tx, a.has_ext,
    ROW_NUMBER() OVER (PARTITION BY a.sym ORDER BY a.total_amt DESC NULLS LAST)
  FROM agg a JOIN profiles p ON p.id = a.uid
  WHERE NOT COALESCE(p.exclude_from_leaderboard, false)
  ORDER BY a.sym, a.total_amt DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END; $$;

-- Global stats: include external→user flows
CREATE OR REPLACE FUNCTION public.get_donation_global_stats(p_time_range text DEFAULT 'all', p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
RETURNS TABLE(totals_by_token jsonb, total_donations bigint, total_donors bigint, total_recipients bigint, total_light_score numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_since timestamptz; v_until timestamptz;
BEGIN
  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from; v_until := p_to;
  ELSE
    v_until := NULL;
    v_since := CASE p_time_range
      WHEN 'day' THEN now() - interval '1 day'
      WHEN 'week' THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL END;
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT d.token_symbol, d.amount::numeric AS amt, d.sender_id, d.recipient_id,
           d.tx_hash, d.light_score_earned, d.leaderboard_eligibility
    FROM donations d
    LEFT JOIN profiles pr ON pr.id = d.recipient_id
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.recipient_id IS NOT NULL
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      AND d.leaderboard_eligibility IN ('internal','external_to_father','external_excluded')
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
  ), per_token AS (
    SELECT token_symbol, SUM(amt) AS total FROM base GROUP BY token_symbol
  )
  SELECT
    (SELECT COALESCE(jsonb_object_agg(token_symbol, total), '{}'::jsonb) FROM per_token),
    (SELECT COUNT(DISTINCT tx_hash) FROM base)::bigint,
    (SELECT COUNT(DISTINCT sender_id) FROM base WHERE sender_id IS NOT NULL)::bigint,
    (SELECT COUNT(DISTINCT recipient_id) FROM base WHERE recipient_id IS NOT NULL)::bigint,
    (SELECT COALESCE(SUM(light_score_earned), 0)::numeric FROM base WHERE leaderboard_eligibility = 'internal');
END; $$;

-- app_stats_cache: include external→user inflows
CREATE OR REPLACE FUNCTION public.refresh_app_stats_cache()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  cutoff_date CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+00';
  v_total_users BIGINT; v_total_posts BIGINT; v_total_photos BIGINT; v_total_videos BIGINT;
  v_total_livestreams BIGINT; v_total_rewards NUMERIC; v_treasury NUMERIC; v_claimed NUMERIC;
  v_user_count BIGINT; v_old_reward NUMERIC; v_new_reward NUMERIC;
  v_videos_combined BIGINT; v_sent JSONB; v_recv JSONB;
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
  v_old_reward := 0; v_new_reward := 0;
  v_total_rewards := (v_user_count * 50000);

  -- SENT = chỉ giao dịch từ user nội bộ
  SELECT COALESCE(jsonb_object_agg(sym, total), '{}'::jsonb) INTO v_sent
  FROM (
    SELECT UPPER(d.token_symbol) AS sym, SUM(d.amount::numeric) AS total
    FROM donations d
    WHERE d.status='confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.token_symbol IS NOT NULL AND d.sender_id IS NOT NULL
    GROUP BY UPPER(d.token_symbol)
  ) z;

  -- RECEIVED = mọi giao dịch on-chain vào user thật (gồm cả ví ngoài)
  SELECT COALESCE(jsonb_object_agg(sym, total), '{}'::jsonb) INTO v_recv
  FROM (
    SELECT UPPER(d.token_symbol) AS sym, SUM(d.amount::numeric) AS total
    FROM donations d
    LEFT JOIN profiles pr ON pr.id = d.recipient_id
    WHERE d.status='confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.token_symbol IS NOT NULL AND d.recipient_id IS NOT NULL
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      AND d.leaderboard_eligibility IN ('internal','external_to_father','external_excluded')
    GROUP BY UPPER(d.token_symbol)
  ) z;

  INSERT INTO app_stats_cache (id, total_users, total_posts, total_photos, total_videos, total_livestreams,
    total_videos_combined, total_rewards, treasury_camly_received, total_camly_claimed,
    sent_token_totals, received_token_totals, refreshed_at)
  VALUES (1, v_total_users, v_total_posts, v_total_photos, v_total_videos, v_total_livestreams,
    v_videos_combined, v_total_rewards, v_treasury, v_claimed, v_sent, v_recv, now())
  ON CONFLICT (id) DO UPDATE SET
    total_users=EXCLUDED.total_users, total_posts=EXCLUDED.total_posts, total_photos=EXCLUDED.total_photos,
    total_videos=EXCLUDED.total_videos, total_livestreams=EXCLUDED.total_livestreams,
    total_videos_combined=EXCLUDED.total_videos_combined, total_rewards=EXCLUDED.total_rewards,
    treasury_camly_received=EXCLUDED.treasury_camly_received, total_camly_claimed=EXCLUDED.total_camly_claimed,
    sent_token_totals=EXCLUDED.sent_token_totals, received_token_totals=EXCLUDED.received_token_totals,
    refreshed_at=EXCLUDED.refreshed_at;
END; $$;
