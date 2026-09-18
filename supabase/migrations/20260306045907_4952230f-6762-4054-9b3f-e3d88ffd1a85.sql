
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
  v_treasury_spent NUMERIC;
  v_treasury_received NUMERIC;
  v_total_dynamic_rewards NUMERIC;
  cutoff_date CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+00';
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_treasury_spent FROM reward_claims;
  
  SELECT COALESCE((value->>'amount')::NUMERIC, 0) INTO v_treasury_received
  FROM system_config WHERE key = 'TREASURY_CAMLY_RECEIVED';

  WITH 
  old_stats AS (
    SELECT 
      p.id AS user_id,
      COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = p.id AND created_at < cutoff_date AND COALESCE(is_reward_eligible, true) = true), 0) AS old_posts,
      COALESCE((
        SELECT COUNT(*) FROM comments c
        INNER JOIN posts po ON c.post_id = po.id
        WHERE po.user_id = p.id AND c.created_at < cutoff_date
      ), 0) AS old_comments,
      COALESCE((
        SELECT COUNT(*) FROM reactions r
        INNER JOIN posts po ON r.post_id = po.id
        WHERE po.user_id = p.id AND r.created_at < cutoff_date
      ), 0) AS old_reactions,
      COALESCE((
        SELECT COUNT(*) FROM shared_posts sp
        INNER JOIN posts po ON sp.original_post_id = po.id
        WHERE po.user_id = p.id AND sp.created_at < cutoff_date
      ), 0) AS old_shares,
      COALESCE((
        SELECT COUNT(*) FROM friendships 
        WHERE (user_id = p.id OR friend_id = p.id) 
          AND status = 'accepted' 
          AND created_at < cutoff_date
      ), 0) AS old_friends
    FROM profiles p
  ),
  new_daily_posts AS (
    SELECT 
      po.user_id,
      (created_at AT TIME ZONE 'UTC')::DATE AS reward_date,
      LEAST(COUNT(*), 10) AS capped_count
    FROM posts po
    WHERE created_at >= cutoff_date
      AND COALESCE(is_reward_eligible, true) = true
    GROUP BY po.user_id, (created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_reactions AS (
    SELECT 
      po.user_id,
      (r.created_at AT TIME ZONE 'UTC')::DATE AS reward_date,
      LEAST(COUNT(*), 50) AS capped_count
    FROM reactions r
    INNER JOIN posts po ON r.post_id = po.id
    WHERE r.created_at >= cutoff_date
    GROUP BY po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_comments AS (
    SELECT 
      po.user_id,
      (c.created_at AT TIME ZONE 'UTC')::DATE AS reward_date,
      LEAST(COUNT(*), 50) AS capped_count
    FROM comments c
    INNER JOIN posts po ON c.post_id = po.id
    WHERE c.created_at >= cutoff_date 
      AND length(c.content) > 20
    GROUP BY po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_shares AS (
    SELECT 
      po.user_id,
      (sp.created_at AT TIME ZONE 'UTC')::DATE AS reward_date,
      LEAST(COUNT(*), 10) AS capped_count
    FROM shared_posts sp
    INNER JOIN posts po ON sp.original_post_id = po.id
    WHERE sp.created_at >= cutoff_date
    GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_friends AS (
    SELECT 
      user_id,
      reward_date,
      LEAST(COUNT(*), 10) AS capped_count
    FROM (
      SELECT user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date FROM friendships 
      WHERE status = 'accepted' AND created_at >= cutoff_date
      UNION ALL
      SELECT friend_id AS user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date FROM friendships 
      WHERE status = 'accepted' AND created_at >= cutoff_date
    ) f
    GROUP BY user_id, reward_date
  ),
  new_daily_livestreams AS (
    SELECT 
      user_id,
      (started_at AT TIME ZONE 'UTC')::DATE AS reward_date,
      LEAST(COUNT(*), 5) AS capped_count
    FROM livestreams
    WHERE started_at >= cutoff_date AND is_eligible = true
    GROUP BY user_id, (started_at AT TIME ZONE 'UTC')::DATE
  ),
  per_user_reward AS (
    SELECT 
      p.id AS user_id,
      (
        50000 +
        COALESCE(os.old_posts, 0) * 10000 +
        COALESCE(os.old_reactions, 0) * 1000 +
        COALESCE(os.old_comments, 0) * 2000 +
        COALESCE(os.old_shares, 0) * 10000 +
        COALESCE(os.old_friends, 0) * 10000 +
        COALESCE((SELECT SUM(capped_count) FROM new_daily_posts WHERE user_id = p.id), 0) * 5000 +
        COALESCE((SELECT SUM(capped_count) FROM new_daily_reactions WHERE user_id = p.id), 0) * 1000 +
        COALESCE((SELECT SUM(capped_count) FROM new_daily_comments WHERE user_id = p.id), 0) * 1000 +
        COALESCE((SELECT SUM(capped_count) FROM new_daily_shares WHERE user_id = p.id), 0) * 1000 +
        COALESCE((SELECT SUM(capped_count) FROM new_daily_friends WHERE user_id = p.id), 0) * 10000 +
        COALESCE((SELECT SUM(capped_count) FROM new_daily_livestreams WHERE user_id = p.id), 0) * 20000
      ) AS total_reward
    FROM profiles p
    LEFT JOIN old_stats os ON os.user_id = p.id
  )
  SELECT SUM(total_reward)::NUMERIC INTO v_total_dynamic_rewards FROM per_user_reward;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM profiles WHERE is_banned = false)::BIGINT,
    (SELECT COUNT(*) FROM posts)::BIGINT,
    (
      SELECT COALESCE(
        (SELECT COUNT(*) FROM posts WHERE image_url IS NOT NULL AND media_urls IS NULL), 0
      ) + COALESCE(
        (SELECT SUM(jsonb_array_length(media_urls::jsonb)) 
         FROM posts 
         WHERE media_urls IS NOT NULL 
         AND jsonb_typeof(media_urls::jsonb) = 'array'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(media_urls::jsonb) elem 
           WHERE elem->>'type' = 'image'
         )
        ), 0
      )
    )::BIGINT,
    (SELECT COUNT(*) FROM posts WHERE video_url IS NOT NULL)::BIGINT,
    (SELECT COUNT(*) FROM live_sessions)::BIGINT,
    COALESCE(v_total_dynamic_rewards, 0),
    v_treasury_received,
    v_treasury_spent;
END;
$function$;
