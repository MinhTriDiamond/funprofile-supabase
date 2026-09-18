
-- Drop and recreate both functions without get_user_rewards_v2 dependency

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
  web3_received numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    COALESCE(p.total_rewards, 0)::bigint AS camly_calculated,
    0::bigint AS camly_today,
    COALESCE(ca.total_claimed, 0)::numeric AS camly_claimed,
    COALESCE(dr.usdt_recv, 0)::numeric AS usdt_received,
    COALESCE(ds.int_sent, 0)::numeric AS internal_sent,
    COALESCE(dr.int_recv, 0)::numeric AS internal_received,
    COALESCE(ds.ext_sent, 0)::numeric AS web3_sent,
    COALESCE(dr.ext_recv, 0)::numeric AS web3_received
  FROM profiles p
  LEFT JOIN light_reputation lr ON lr.user_id = p.id
  LEFT JOIN claim_agg ca ON ca.user_id = p.id
  LEFT JOIN donation_sent ds ON ds.user_id = p.id
  LEFT JOIN donation_recv dr ON dr.user_id = p.id
  ORDER BY COALESCE(p.total_rewards, 0) DESC;
END;
$function$;

-- Drop and recreate totals function
DROP FUNCTION IF EXISTS public.get_user_directory_totals();

CREATE OR REPLACE FUNCTION public.get_user_directory_totals()
RETURNS TABLE(
  total_users bigint,
  total_camly_calculated numeric,
  total_camly_claimed numeric,
  total_light_score numeric,
  total_pending numeric,
  total_approved numeric,
  total_minted numeric,
  total_posts bigint,
  total_comments bigint,
  total_internal_sent numeric,
  total_internal_received numeric,
  total_web3_sent numeric,
  total_web3_received numeric,
  total_withdrawn numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM profiles)::bigint AS total_users,
    COALESCE((SELECT SUM(p.total_rewards) FROM profiles p), 0)::numeric AS total_camly_calculated,
    COALESCE((SELECT SUM(rc.amount) FROM reward_claims rc), 0)::numeric AS total_camly_claimed,
    COALESCE((SELECT SUM(lr.total_light_score) FROM light_reputation lr), 0)::numeric AS total_light_score,
    COALESCE((SELECT SUM(p.pending_reward) FROM profiles p), 0)::numeric AS total_pending,
    COALESCE((SELECT SUM(p.approved_reward) FROM profiles p), 0)::numeric AS total_approved,
    COALESCE((SELECT SUM(lr.total_minted) FROM light_reputation lr), 0)::numeric AS total_minted,
    (SELECT COUNT(*) FROM posts)::bigint AS total_posts,
    (SELECT COUNT(*) FROM comments)::bigint AS total_comments,
    COALESCE((SELECT SUM(d.amount::numeric) FROM donations d WHERE (d.is_external = false OR d.is_external IS NULL) AND d.sender_id IS NOT NULL), 0)::numeric AS total_internal_sent,
    COALESCE((SELECT SUM(d.amount::numeric) FROM donations d WHERE (d.is_external = false OR d.is_external IS NULL) AND d.recipient_id IS NOT NULL), 0)::numeric AS total_internal_received,
    COALESCE((SELECT SUM(d.amount::numeric) FROM donations d WHERE d.is_external = true AND d.sender_id IS NOT NULL), 0)::numeric AS total_web3_sent,
    COALESCE((SELECT SUM(d.amount::numeric) FROM donations d WHERE d.is_external = true AND d.recipient_id IS NOT NULL), 0)::numeric AS total_web3_received,
    COALESCE((SELECT SUM(rc.amount) FROM reward_claims rc), 0)::numeric AS total_withdrawn;
END;
$function$;
