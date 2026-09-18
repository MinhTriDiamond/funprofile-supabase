
DROP FUNCTION IF EXISTS public.get_user_directory_summary();

CREATE OR REPLACE FUNCTION public.get_user_directory_summary()
RETURNS TABLE(
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  wallet_address text,
  created_at timestamptz,
  is_banned boolean,
  pending_reward bigint,
  approved_reward bigint,
  reward_status text,
  posts_count bigint,
  comments_count bigint,
  reactions_on_posts bigint,
  friends_count bigint,
  shares_count bigint,
  livestreams_count bigint,
  total_light_score numeric,
  tier integer,
  total_minted numeric,
  camly_calculated bigint,
  camly_today bigint,
  camly_claimed numeric,
  usdt_received numeric,
  internal_sent numeric,
  internal_received numeric,
  web3_sent numeric,
  web3_received numeric,
  email text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_date CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+00';
BEGIN
  RETURN QUERY
  WITH claim_agg AS (
    SELECT rc.user_id, COALESCE(SUM(rc.amount), 0) AS total_claimed
    FROM reward_claims rc
    GROUP BY rc.user_id
  ),
  donation_sent AS (
    SELECT 
      d.sender_id AS user_id,
      COALESCE(SUM(CASE WHEN d.is_external = false OR d.is_external IS NULL THEN d.amount::numeric ELSE 0 END), 0) AS int_sent,
      COALESCE(SUM(CASE WHEN d.is_external = true THEN d.amount::numeric ELSE 0 END), 0) AS ext_sent
    FROM donations d
    WHERE d.sender_id IS NOT NULL
    GROUP BY d.sender_id
  ),
  donation_recv AS (
    SELECT 
      d.recipient_id AS user_id,
      COALESCE(SUM(CASE WHEN d.is_external = false OR d.is_external IS NULL THEN d.amount::numeric ELSE 0 END), 0) AS int_recv,
      COALESCE(SUM(CASE WHEN d.is_external = true THEN d.amount::numeric ELSE 0 END), 0) AS ext_recv,
      COALESCE(SUM(CASE WHEN d.token_symbol IN ('USDT', 'BTCB') THEN d.amount::numeric ELSE 0 END), 0) AS usdt_recv
    FROM donations d
    WHERE d.recipient_id IS NOT NULL
    GROUP BY d.recipient_id
  ),
  old_stats AS (
    SELECT 
      p.id AS user_id,
      COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = p.id AND created_at < cutoff_date AND COALESCE(is_reward_eligible, true) = true), 0) AS old_posts,
      COALESCE((SELECT COUNT(*) FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE po.user_id = p.id AND r.created_at < cutoff_date), 0) AS old_reactions,
      COALESCE((SELECT COUNT(*) FROM comments c INNER JOIN posts po ON c.post_id = po.id WHERE po.user_id = p.id AND c.created_at < cutoff_date), 0) AS old_comments,
      COALESCE((SELECT COUNT(*) FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE po.user_id = p.id AND sp.created_at < cutoff_date), 0) AS old_shares,
      COALESCE((SELECT COUNT(*) FROM friendships WHERE (user_id = p.id OR friend_id = p.id) AND status = 'accepted' AND created_at < cutoff_date), 0) AS old_friends
    FROM profiles p
  ),
  new_daily_posts AS (
    SELECT po.user_id, (po.created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 10) AS capped_count
    FROM posts po WHERE po.created_at >= cutoff_date AND COALESCE(po.is_reward_eligible, true) = true
    GROUP BY po.user_id, (po.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_reactions AS (
    SELECT po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 50) AS capped_count
    FROM reactions r INNER JOIN posts po ON r.post_id = po.id
    WHERE r.created_at >= cutoff_date
    GROUP BY po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_comments AS (
    SELECT po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 50) AS capped_count
    FROM comments c INNER JOIN posts po ON c.post_id = po.id
    WHERE c.created_at >= cutoff_date AND length(c.content) > 20
    GROUP BY po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_shares AS (
    SELECT po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 10) AS capped_count
    FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
    WHERE sp.created_at >= cutoff_date
    GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_friends AS (
    SELECT user_id, reward_date, LEAST(COUNT(*), 10) AS capped_count FROM (
      SELECT user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date FROM friendships WHERE status = 'accepted' AND created_at >= cutoff_date
      UNION ALL
      SELECT friend_id AS user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date FROM friendships WHERE status = 'accepted' AND created_at >= cutoff_date
    ) f GROUP BY user_id, reward_date
  ),
  new_daily_livestreams AS (
    SELECT user_id, (started_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 5) AS capped_count
    FROM livestreams WHERE started_at >= cutoff_date AND is_eligible = true
    GROUP BY user_id, (started_at AT TIME ZONE 'UTC')::DATE
  ),
  new_stats AS (
    SELECT 
      p.id AS user_id,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_posts WHERE user_id = p.id), 0) AS new_posts,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_reactions WHERE user_id = p.id), 0) AS new_reactions,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_comments WHERE user_id = p.id), 0) AS new_comments,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_shares WHERE user_id = p.id), 0) AS new_shares,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_friends WHERE user_id = p.id), 0) AS new_friends,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_livestreams WHERE user_id = p.id), 0) AS new_livestreams
    FROM profiles p
  )
  SELECT 
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.public_wallet_address AS wallet_address,
    p.created_at,
    p.is_banned,
    COALESCE(p.pending_reward, 0)::bigint AS pending_reward,
    COALESCE(p.approved_reward, 0)::bigint AS approved_reward,
    COALESCE(p.reward_status, 'pending')::text AS reward_status,
    (SELECT COUNT(*) FROM posts po WHERE po.user_id = p.id)::bigint AS posts_count,
    (SELECT COUNT(*) FROM comments c INNER JOIN posts po ON c.post_id = po.id WHERE po.user_id = p.id)::bigint AS comments_count,
    (SELECT COUNT(*) FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE po.user_id = p.id)::bigint AS reactions_on_posts,
    (SELECT COUNT(*) FROM friendships f WHERE (f.user_id = p.id OR f.friend_id = p.id) AND f.status = 'accepted')::bigint AS friends_count,
    (SELECT COUNT(*) FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE po.user_id = p.id)::bigint AS shares_count,
    (SELECT COUNT(*) FROM livestreams l WHERE l.user_id = p.id AND l.is_eligible = true)::bigint AS livestreams_count,
    COALESCE(lr.total_light_score, 0)::numeric AS total_light_score,
    COALESCE(lr.tier, 0)::integer AS tier,
    COALESCE(lr.total_minted, 0)::numeric AS total_minted,
    (
      50000
      + (os.old_posts * 5000) + (os.old_reactions * 1000) + (os.old_comments * 1000) + (os.old_shares * 1000) + (os.old_friends * 10000)
      + (ns.new_posts * 5000) + (ns.new_reactions * 1000) + (ns.new_comments * 1000) + (ns.new_shares * 1000) + (ns.new_friends * 10000) + (ns.new_livestreams * 20000)
    )::bigint AS camly_calculated,
    0::bigint AS camly_today,
    COALESCE(ca.total_claimed, 0)::numeric AS camly_claimed,
    COALESCE(dr.usdt_recv, 0)::numeric AS usdt_received,
    COALESCE(ds.int_sent, 0)::numeric AS internal_sent,
    COALESCE(dr.int_recv, 0)::numeric AS internal_received,
    COALESCE(ds.ext_sent, 0)::numeric AS web3_sent,
    COALESCE(dr.ext_recv, 0)::numeric AS web3_received,
    au.email::text AS email
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  LEFT JOIN light_reputation lr ON lr.user_id = p.id
  LEFT JOIN claim_agg ca ON ca.user_id = p.id
  LEFT JOIN donation_sent ds ON ds.user_id = p.id
  LEFT JOIN donation_recv dr ON dr.user_id = p.id
  LEFT JOIN old_stats os ON os.user_id = p.id
  LEFT JOIN new_stats ns ON ns.user_id = p.id
  ORDER BY camly_calculated DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_user_directory_summary() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_directory_summary() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_directory_summary() TO authenticated;
