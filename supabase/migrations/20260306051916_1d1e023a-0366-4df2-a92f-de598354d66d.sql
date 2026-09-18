
DROP FUNCTION IF EXISTS public.get_app_stats();

CREATE OR REPLACE FUNCTION public.get_app_stats()
RETURNS TABLE(
  total_users BIGINT,
  total_posts BIGINT,
  total_photos BIGINT,
  total_videos BIGINT,
  total_livestreams BIGINT,
  total_rewards NUMERIC,
  treasury_camly_received NUMERIC,
  total_camly_claimed NUMERIC
)
LANGUAGE plpgsql
STABLE
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
BEGIN
  -- Basic counts (fast, single table scans)
  SELECT COUNT(*) INTO v_total_users FROM profiles;
  SELECT COUNT(*) INTO v_total_posts FROM posts;
  SELECT COUNT(*) FROM posts WHERE image_url IS NOT NULL INTO v_total_photos;
  SELECT COUNT(*) FROM posts WHERE video_url IS NOT NULL INTO v_total_videos;
  SELECT COUNT(*) INTO v_total_livestreams FROM live_sessions;

  -- Treasury & claimed
  SELECT COALESCE(SUM(amount), 0) INTO v_treasury
  FROM reward_claims WHERE status = 'completed';
  
  v_claimed := v_treasury;

  -- User count for bonus (ALL users including banned)
  SELECT COUNT(*) INTO v_user_count FROM profiles;

  -- OLD period rewards (before cutoff) - aggregate across all tables, no per-user loop
  SELECT
    COALESCE(SUM(sub.reward), 0) INTO v_old_reward
  FROM (
    -- Old posts reward: count per user × 10000
    SELECT user_id, COUNT(*) * 10000 AS reward
    FROM posts
    WHERE created_at < cutoff_date AND COALESCE(is_reward_eligible, true) = true
    GROUP BY user_id
    
    UNION ALL
    
    -- Old reactions on user's posts × 1000
    SELECT po.user_id, COUNT(*) * 1000 AS reward
    FROM reactions r
    INNER JOIN posts po ON r.post_id = po.id
    WHERE r.created_at < cutoff_date
    GROUP BY po.user_id
    
    UNION ALL
    
    -- Old comments on user's posts × 2000
    SELECT po.user_id, COUNT(*) * 2000 AS reward
    FROM comments c
    INNER JOIN posts po ON c.post_id = po.id
    WHERE c.created_at < cutoff_date
    GROUP BY po.user_id
    
    UNION ALL
    
    -- Old shares × 10000
    SELECT po.user_id, COUNT(*) * 10000 AS reward
    FROM shared_posts sp
    INNER JOIN posts po ON sp.original_post_id = po.id
    WHERE sp.created_at < cutoff_date
    GROUP BY po.user_id
    
    UNION ALL
    
    -- Old friends × 10000 (each friendship counted once per side)
    SELECT user_id, COUNT(*) * 10000 AS reward
    FROM (
      SELECT user_id FROM friendships WHERE status = 'accepted' AND created_at < cutoff_date
      UNION ALL
      SELECT friend_id AS user_id FROM friendships WHERE status = 'accepted' AND created_at < cutoff_date
    ) f
    GROUP BY user_id
  ) sub;

  -- NEW period rewards (after cutoff) - with daily caps, aggregate directly
  SELECT COALESCE(SUM(sub.reward), 0) INTO v_new_reward
  FROM (
    -- New posts: 5000 × LEAST(count, 10) per user per day
    SELECT SUM(LEAST(cnt, 10)) * 5000 AS reward
    FROM (
      SELECT user_id, (created_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt
      FROM posts
      WHERE created_at >= cutoff_date AND COALESCE(is_reward_eligible, true) = true
      GROUP BY user_id, (created_at AT TIME ZONE 'UTC')::DATE
    ) x
    
    UNION ALL
    
    -- New reactions on posts: 1000 × LEAST(count, 50) per user per day
    SELECT SUM(LEAST(cnt, 50)) * 1000 AS reward
    FROM (
      SELECT po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt
      FROM reactions r
      INNER JOIN posts po ON r.post_id = po.id
      WHERE r.created_at >= cutoff_date
      GROUP BY po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE
    ) x
    
    UNION ALL
    
    -- New comments: 1000 × LEAST(count, 50) per user per day
    SELECT SUM(LEAST(cnt, 50)) * 1000 AS reward
    FROM (
      SELECT po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt
      FROM comments c
      INNER JOIN posts po ON c.post_id = po.id
      WHERE c.created_at >= cutoff_date AND length(c.content) > 20
      GROUP BY po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE
    ) x
    
    UNION ALL
    
    -- New shares: 1000 × LEAST(count, 10) per user per day
    SELECT SUM(LEAST(cnt, 10)) * 1000 AS reward
    FROM (
      SELECT po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt
      FROM shared_posts sp
      INNER JOIN posts po ON sp.original_post_id = po.id
      WHERE sp.created_at >= cutoff_date
      GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE
    ) x
    
    UNION ALL
    
    -- New friends: 10000 × LEAST(count, 10) per user per day
    SELECT SUM(LEAST(cnt, 10)) * 10000 AS reward
    FROM (
      SELECT user_id, reward_date AS d, COUNT(*) AS cnt
      FROM (
        SELECT user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date FROM friendships WHERE status = 'accepted' AND created_at >= cutoff_date
        UNION ALL
        SELECT friend_id, (created_at AT TIME ZONE 'UTC')::DATE FROM friendships WHERE status = 'accepted' AND created_at >= cutoff_date
      ) f
      GROUP BY user_id, reward_date
    ) x
    
    UNION ALL
    
    -- New livestreams: 20000 × LEAST(count, 5) per user per day
    SELECT SUM(LEAST(cnt, 5)) * 20000 AS reward
    FROM (
      SELECT user_id, (started_at AT TIME ZONE 'UTC')::DATE AS d, COUNT(*) AS cnt
      FROM livestreams
      WHERE started_at >= cutoff_date AND is_eligible = true
      GROUP BY user_id, (started_at AT TIME ZONE 'UTC')::DATE
    ) x
  ) sub;

  -- Total = bonus (50K × users) + old + new
  v_total_rewards := (v_user_count * 50000) + v_old_reward + v_new_reward;

  RETURN QUERY SELECT
    v_total_users,
    v_total_posts,
    v_total_photos,
    v_total_videos,
    v_total_livestreams,
    v_total_rewards,
    v_treasury,
    v_claimed;
END;
$function$;
