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
  -- v2 (13/06/2026): Chỉ tính donations NỘI BỘ đã confirmed. Loại wallet_transfers + swaps khỏi cache
  -- để 2 card lớn ở Honor Board khớp với modal "Global Gifted Value" (RPC get_global_gift_breakdown).
  -- Số liệu Wallet Flow đầy đủ vẫn truy cập được qua RPC get_global_wallet_flow_breakdown.
  WITH all_sent AS (
    SELECT UPPER(d.token_symbol) AS sym, SUM((d.amount)::numeric) AS amt
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.token_symbol IS NOT NULL
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
    GROUP BY UPPER(d.token_symbol)
  )
  SELECT COALESCE(jsonb_object_agg(sym, total), '{}'::jsonb) INTO v_sent
  FROM (SELECT sym, SUM(amt) AS total FROM all_sent GROUP BY sym) z;

  WITH all_recv AS (
    SELECT UPPER(d.token_symbol) AS sym, SUM((d.amount)::numeric) AS amt
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.token_symbol IS NOT NULL
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
    GROUP BY UPPER(d.token_symbol)
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

-- Refresh cache ngay để 2 card lớn cập nhật số mới
SELECT public.refresh_app_stats_cache();