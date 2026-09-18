-- A. Bản công khai: 23 cột, bỏ email + 4 field nội bộ, yêu cầu đăng nhập
DROP FUNCTION IF EXISTS public.get_user_directory_summary();

CREATE OR REPLACE FUNCTION public.get_user_directory_summary()
RETURNS TABLE(id uuid, username text, full_name text, avatar_url text, wallet_address text, created_at timestamp with time zone, is_banned boolean, posts_count bigint, comments_count bigint, reactions_on_posts bigint, friends_count bigint, shares_count bigint, livestreams_count bigint, total_light_score numeric, tier integer, total_minted numeric, camly_calculated bigint, camly_claimed numeric, usdt_received numeric, internal_sent numeric, internal_received numeric, web3_sent numeric, web3_received numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'permission denied: authentication required';
  END IF;

  RETURN QUERY
  WITH claim_agg AS (
    SELECT rc.user_id, COALESCE(SUM(rc.amount), 0) AS total_claimed
    FROM reward_claims rc GROUP BY rc.user_id
  ),
  donation_sent AS (
    SELECT d.sender_id AS user_id,
      COALESCE(SUM(CASE WHEN d.is_external = false OR d.is_external IS NULL THEN d.amount::numeric ELSE 0 END), 0) AS int_sent,
      COALESCE(SUM(CASE WHEN d.is_external = true THEN d.amount::numeric ELSE 0 END), 0) AS ext_sent
    FROM donations d WHERE d.sender_id IS NOT NULL GROUP BY d.sender_id
  ),
  donation_recv AS (
    SELECT d.recipient_id AS user_id,
      COALESCE(SUM(CASE WHEN d.is_external = false OR d.is_external IS NULL THEN d.amount::numeric ELSE 0 END), 0) AS int_recv,
      COALESCE(SUM(CASE WHEN d.is_external = true THEN d.amount::numeric ELSE 0 END), 0) AS ext_recv,
      COALESCE(SUM(CASE WHEN d.token_symbol IN ('USDT', 'BTCB') THEN d.amount::numeric ELSE 0 END), 0) AS usdt_recv
    FROM donations d WHERE d.recipient_id IS NOT NULL GROUP BY d.recipient_id
  )
  SELECT p.id, p.username, p.full_name, p.avatar_url,
    p.public_wallet_address AS wallet_address, p.created_at, p.is_banned,
    (SELECT COUNT(*) FROM posts po WHERE po.user_id = p.id)::bigint,
    (SELECT COUNT(*) FROM comments c INNER JOIN posts po ON c.post_id = po.id WHERE po.user_id = p.id)::bigint,
    (SELECT COUNT(*) FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE po.user_id = p.id)::bigint,
    (SELECT COUNT(*) FROM friendships f WHERE (f.user_id = p.id OR f.friend_id = p.id) AND f.status = 'accepted')::bigint,
    (SELECT COUNT(*) FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE po.user_id = p.id)::bigint,
    (SELECT COUNT(*) FROM livestreams l WHERE l.user_id = p.id AND l.is_eligible = true)::bigint,
    COALESCE(lr.total_light_score, 0)::numeric,
    COALESCE(lr.tier, 0)::integer,
    COALESCE(lr.total_minted, 0)::numeric,
    COALESCE(p.total_rewards, 0)::bigint AS camly_calculated,
    COALESCE(ca.total_claimed, 0)::numeric,
    COALESCE(dr.usdt_recv, 0)::numeric,
    COALESCE(ds.int_sent, 0)::numeric,
    COALESCE(dr.int_recv, 0)::numeric,
    COALESCE(ds.ext_sent, 0)::numeric,
    COALESCE(dr.ext_recv, 0)::numeric
  FROM profiles p
  LEFT JOIN light_reputation lr ON lr.user_id = p.id
  LEFT JOIN claim_agg ca ON ca.user_id = p.id
  LEFT JOIN donation_sent ds ON ds.user_id = p.id
  LEFT JOIN donation_recv dr ON dr.user_id = p.id
  ORDER BY camly_calculated DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_user_directory_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_directory_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_directory_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_directory_summary() TO service_role;

-- B. Bản admin: đủ 28 cột
CREATE OR REPLACE FUNCTION public.get_user_directory_admin()
RETURNS TABLE(id uuid, username text, full_name text, avatar_url text, wallet_address text, created_at timestamp with time zone, is_banned boolean, pending_reward bigint, approved_reward bigint, reward_status text, posts_count bigint, comments_count bigint, reactions_on_posts bigint, friends_count bigint, shares_count bigint, livestreams_count bigint, total_light_score numeric, tier integer, total_minted numeric, camly_calculated bigint, camly_today bigint, camly_claimed numeric, usdt_received numeric, internal_sent numeric, internal_received numeric, web3_sent numeric, web3_received numeric, email text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin role required';
  END IF;

  RETURN QUERY
  WITH claim_agg AS (
    SELECT rc.user_id, COALESCE(SUM(rc.amount), 0) AS total_claimed
    FROM reward_claims rc GROUP BY rc.user_id
  ),
  donation_sent AS (
    SELECT d.sender_id AS user_id,
      COALESCE(SUM(CASE WHEN d.is_external = false OR d.is_external IS NULL THEN d.amount::numeric ELSE 0 END), 0) AS int_sent,
      COALESCE(SUM(CASE WHEN d.is_external = true THEN d.amount::numeric ELSE 0 END), 0) AS ext_sent
    FROM donations d WHERE d.sender_id IS NOT NULL GROUP BY d.sender_id
  ),
  donation_recv AS (
    SELECT d.recipient_id AS user_id,
      COALESCE(SUM(CASE WHEN d.is_external = false OR d.is_external IS NULL THEN d.amount::numeric ELSE 0 END), 0) AS int_recv,
      COALESCE(SUM(CASE WHEN d.is_external = true THEN d.amount::numeric ELSE 0 END), 0) AS ext_recv,
      COALESCE(SUM(CASE WHEN d.token_symbol IN ('USDT', 'BTCB') THEN d.amount::numeric ELSE 0 END), 0) AS usdt_recv
    FROM donations d WHERE d.recipient_id IS NOT NULL GROUP BY d.recipient_id
  )
  SELECT p.id, p.username, p.full_name, p.avatar_url,
    p.public_wallet_address AS wallet_address, p.created_at, p.is_banned,
    COALESCE(p.pending_reward, 0)::bigint,
    COALESCE(p.approved_reward, 0)::bigint,
    COALESCE(p.reward_status, 'pending')::text,
    (SELECT COUNT(*) FROM posts po WHERE po.user_id = p.id)::bigint,
    (SELECT COUNT(*) FROM comments c INNER JOIN posts po ON c.post_id = po.id WHERE po.user_id = p.id)::bigint,
    (SELECT COUNT(*) FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE po.user_id = p.id)::bigint,
    (SELECT COUNT(*) FROM friendships f WHERE (f.user_id = p.id OR f.friend_id = p.id) AND f.status = 'accepted')::bigint,
    (SELECT COUNT(*) FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE po.user_id = p.id)::bigint,
    (SELECT COUNT(*) FROM livestreams l WHERE l.user_id = p.id AND l.is_eligible = true)::bigint,
    COALESCE(lr.total_light_score, 0)::numeric,
    COALESCE(lr.tier, 0)::integer,
    COALESCE(lr.total_minted, 0)::numeric,
    COALESCE(p.total_rewards, 0)::bigint AS camly_calculated,
    0::bigint AS camly_today,
    COALESCE(ca.total_claimed, 0)::numeric,
    COALESCE(dr.usdt_recv, 0)::numeric,
    COALESCE(ds.int_sent, 0)::numeric,
    COALESCE(dr.int_recv, 0)::numeric,
    COALESCE(ds.ext_sent, 0)::numeric,
    COALESCE(dr.ext_recv, 0)::numeric,
    au.email::text
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  LEFT JOIN light_reputation lr ON lr.user_id = p.id
  LEFT JOIN claim_agg ca ON ca.user_id = p.id
  LEFT JOIN donation_sent ds ON ds.user_id = p.id
  LEFT JOIN donation_recv dr ON dr.user_id = p.id
  ORDER BY camly_calculated DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_user_directory_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_directory_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_directory_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_directory_admin() TO service_role;