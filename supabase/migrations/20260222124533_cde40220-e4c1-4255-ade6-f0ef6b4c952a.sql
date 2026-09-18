DROP FUNCTION IF EXISTS public.get_app_stats();

CREATE OR REPLACE FUNCTION public.get_app_stats()
 RETURNS TABLE(total_users bigint, total_posts bigint, total_photos bigint, total_videos bigint, total_reward bigint, total_camly_circulating numeric, treasury_camly_received numeric, total_camly_claimed numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH reward_stats AS (
    SELECT 
      COALESCE(SUM(
        50000 +
        (COALESCE(posts_ct, 0) * 10000) +
        (COALESCE(reactions_ct, 0) * 1000) +
        (COALESCE(comments_ct, 0) * 2000) +
        (COALESCE(shares_ct, 0) * 10000) +
        (COALESCE(friends_ct, 0) * 10000)
      ), 0) AS total_reward_sum
    FROM (
      SELECT 
        p.id,
        (SELECT COUNT(*) FROM posts WHERE user_id = p.id) AS posts_ct,
        (SELECT COUNT(*) FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE po.user_id = p.id) AS reactions_ct,
        (SELECT COUNT(*) FROM comments c INNER JOIN posts po ON c.post_id = po.id WHERE po.user_id = p.id) AS comments_ct,
        (SELECT COUNT(*) FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE po.user_id = p.id) AS shares_ct,
        (SELECT COUNT(*) FROM friendships WHERE (user_id = p.id OR friend_id = p.id) AND status = 'accepted') AS friends_ct
      FROM profiles p
      WHERE p.is_banned = false
    ) user_data
  ),
  media_stats AS (
    SELECT 
      COUNT(*) AS post_count,
      COUNT(*) FILTER (WHERE image_url IS NOT NULL OR (media_urls IS NOT NULL AND media_urls::text ~ '"image')) AS photo_count,
      COUNT(*) FILTER (WHERE video_url IS NOT NULL OR (media_urls IS NOT NULL AND media_urls::text ~ '"video')) AS video_count
    FROM posts
  ),
  circulating AS (
    SELECT COALESCE(SUM(amt), 0) AS camly_circ
    FROM (
      SELECT amount::NUMERIC AS amt FROM reward_claims
      UNION ALL
      SELECT amount::NUMERIC AS amt FROM donations WHERE token_symbol = 'CAMLY' AND status = 'confirmed'
    ) combined
  ),
  treasury AS (
    SELECT COALESCE((value->>'amount')::NUMERIC, 0) AS treasury_amt
    FROM system_config
    WHERE key = 'TREASURY_CAMLY_RECEIVED'
  ),
  claimed AS (
    SELECT 
      COALESCE(
        (SELECT SUM(amount::NUMERIC) FROM reward_claims), 0
      ) + COALESCE(
        (SELECT SUM(amount::NUMERIC) FROM donations 
         WHERE sender_id = '9e702a6f-4035-4f30-9c04-f2e21419b37a' 
           AND token_symbol = 'CAMLY' 
           AND status = 'confirmed'), 0
      ) AS total_claimed
  )
  SELECT 
    (SELECT COUNT(*) FROM profiles WHERE is_banned = false)::BIGINT,
    ms.post_count::BIGINT,
    ms.photo_count::BIGINT,
    ms.video_count::BIGINT,
    rs.total_reward_sum::BIGINT,
    c.camly_circ,
    COALESCE(t.treasury_amt, 0),
    cl.total_claimed
  FROM reward_stats rs
  CROSS JOIN media_stats ms
  CROSS JOIN circulating c
  CROSS JOIN (SELECT COALESCE(treasury_amt, 0) AS treasury_amt FROM treasury) t
  CROSS JOIN claimed cl;
END;
$function$;