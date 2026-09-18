-- A1-1: 5 function admin có guard dựa trên p_admin_id do client truyền → chuyển sang auth.uid()

CREATE OR REPLACE FUNCTION public.ban_user_permanently(p_admin_id uuid, p_user_id uuid, p_reason text DEFAULT 'Lạm dụng hệ thống'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet text;
  v_actor uuid := auth.uid();
BEGIN
  -- SECURITY: actor = phiên đăng nhập thật, KHÔNG tin p_admin_id
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can ban users';
  END IF;

  SELECT wallet_address INTO v_wallet FROM profiles WHERE id = p_user_id;

  UPDATE profiles SET
    is_banned = true,
    banned_at = now(),
    ban_reason = p_reason
  WHERE id = p_user_id;

  IF v_wallet IS NOT NULL AND v_wallet != '' THEN
    INSERT INTO blacklisted_wallets (wallet_address, reason, is_permanent, user_id, created_by)
    VALUES (lower(v_wallet), p_reason, true, p_user_id, v_actor)
    ON CONFLICT (wallet_address) DO NOTHING;
  END IF;

  UPDATE pplp_mint_requests
  SET status = 'rejected',
      error_message = 'User banned: ' || p_reason,
      reviewed_by = v_actor,
      reviewed_at = now()
  WHERE user_id = p_user_id
    AND status IN ('pending', 'pending_sig', 'signing');

  INSERT INTO audit_logs (admin_id, action, target_user_id, reason, details)
  VALUES (v_actor, 'BAN_USER_PERMANENT', p_user_id, p_reason,
          jsonb_build_object('claimed_admin_id', p_admin_id));

  INSERT INTO notifications (user_id, actor_id, type)
  VALUES (p_user_id, v_actor, 'account_banned');

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unban_user(p_admin_id uuid, p_user_id uuid, p_reason text DEFAULT 'Admin đã mở khóa tài khoản'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can unban users';
  END IF;

  UPDATE profiles SET
    is_banned = false,
    banned_at = NULL,
    ban_reason = NULL,
    reward_status = 'approved'
  WHERE id = p_user_id AND is_banned = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found or not banned';
  END IF;

  DELETE FROM blacklisted_wallets WHERE user_id = p_user_id;

  INSERT INTO audit_logs (admin_id, action, target_user_id, reason, details)
  VALUES (v_actor, 'UNBAN_USER', p_user_id, p_reason,
          jsonb_build_object('claimed_admin_id', p_admin_id));

  INSERT INTO notifications (user_id, actor_id, type)
  VALUES (p_user_id, v_actor, 'account_unbanned');

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.batch_ban_ghost_users(user_ids uuid[], admin_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  banned_count integer := 0;
  uid uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  FOREACH uid IN ARRAY user_ids LOOP
    UPDATE profiles SET
      is_banned = true,
      reward_status = 'banned',
      admin_notes = 'Tài khoản ảo - bị cấm tự động bởi admin'
    WHERE id = uid AND is_banned = false;

    IF FOUND THEN
      banned_count := banned_count + 1;
      INSERT INTO audit_logs (admin_id, target_user_id, action, reason, details)
      VALUES (v_actor, uid, 'batch_ban_ghost', 'Ghost account cleanup',
              jsonb_build_object('claimed_admin_id', admin_id));
    END IF;
  END LOOP;

  RETURN banned_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_emails_for_admin(p_admin_id uuid)
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can access user emails';
  END IF;

  RETURN QUERY
  SELECT au.id AS user_id, au.email::TEXT AS email
  FROM auth.users au;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_qualified_reward_users(p_admin_id uuid)
 RETURNS TABLE(user_id uuid, username text, full_name text, avatar_url text, real_links_count integer, days_active bigint, donation_count bigint, total_donated numeric, light_score numeric, tier integer, wallet_address text, reward_status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can access qualified users list';
  END IF;

  RETURN QUERY
  WITH social_counts AS (
    SELECT
      p.id,
      (SELECT COUNT(*) FROM jsonb_array_elements(p.social_links) elem
       WHERE elem->>'url' IS NOT NULL AND trim(elem->>'url') != '')::INTEGER AS real_links
    FROM profiles p
    WHERE p.is_banned = false AND p.social_links IS NOT NULL
  ),
  active_days AS (
    SELECT
      po.user_id,
      COUNT(DISTINCT (po.created_at AT TIME ZONE 'UTC')::DATE) AS days_active
    FROM posts po
    GROUP BY po.user_id
  ),
  donation_stats AS (
    SELECT
      d.sender_id,
      COUNT(*) AS donation_count,
      SUM(d.amount::NUMERIC) AS total_donated
    FROM donations d
    WHERE d.status = 'confirmed' AND d.tx_hash IS NOT NULL AND trim(d.tx_hash) != ''
    GROUP BY d.sender_id
  ),
  light_scores AS (
    SELECT lr.user_id, lr.total_light_score, lr.tier
    FROM light_reputation lr
    WHERE lr.total_light_score > 0
  )
  SELECT
    p.id AS user_id,
    p.username,
    p.full_name,
    p.avatar_url,
    sc.real_links AS real_links_count,
    ad.days_active,
    ds.donation_count,
    ds.total_donated,
    ls.total_light_score AS light_score,
    ls.tier,
    p.wallet_address,
    p.reward_status,
    p.created_at
  FROM profiles p
  INNER JOIN social_counts sc ON sc.id = p.id AND sc.real_links >= 2
  INNER JOIN active_days ad ON ad.user_id = p.id AND ad.days_active >= 10
  INNER JOIN donation_stats ds ON ds.sender_id = p.id AND ds.donation_count >= 1
  INNER JOIN light_scores ls ON ls.user_id = p.id
  ORDER BY ls.total_light_score DESC;
END;
$function$;

-- Không cần cho anon: admin luôn đăng nhập
REVOKE ALL ON FUNCTION public.ban_user_permanently(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unban_user(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.batch_ban_ghost_users(uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_emails_for_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_qualified_reward_users(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ban_user_permanently(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unban_user(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.batch_ban_ghost_users(uuid[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_emails_for_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_qualified_reward_users(uuid) TO authenticated, service_role;