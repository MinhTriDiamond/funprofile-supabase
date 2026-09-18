
-- 1. Update get_pplp_admin_stats to filter banned users
CREATE OR REPLACE FUNCTION public.get_pplp_admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  WITH user_totals AS (
    SELECT
      la.user_id,
      SUM(la.mint_amount) AS total_fun,
      COUNT(*) AS action_count
    FROM light_actions la
    WHERE la.mint_status = 'approved'
      AND la.mint_amount > 0
    GROUP BY la.user_id
  ),
  enriched_users AS (
    SELECT
      ut.user_id,
      p.username,
      p.avatar_url,
      ut.total_fun,
      ut.action_count,
      (p.public_wallet_address IS NOT NULL AND p.public_wallet_address != '') AS has_wallet,
      p.public_wallet_address,
      p.wallet_address
    FROM user_totals ut
    LEFT JOIN profiles p ON p.id = ut.user_id
    WHERE p.is_banned = false
  ),
  minted_stats AS (
    SELECT
      COALESCE(SUM(amount_display), 0) AS total_minted_fun,
      COUNT(*) AS total_minted_requests
    FROM pplp_mint_requests
    WHERE status = 'confirmed'
  ),
  pending_stats AS (
    SELECT
      COALESCE(SUM(mr.amount_display), 0) AS pending_sig_fun,
      COUNT(*) AS pending_sig_count
    FROM pplp_mint_requests mr
    INNER JOIN profiles p ON p.id = mr.user_id
    WHERE mr.status = 'pending_sig'
      AND p.is_banned = false
  )
  SELECT jsonb_build_object(
    'total_approved_fun', (SELECT COALESCE(SUM(total_fun), 0) FROM enriched_users),
    'total_approved_actions', (SELECT COALESCE(SUM(action_count), 0) FROM enriched_users),
    'total_minted_fun', (SELECT total_minted_fun FROM minted_stats),
    'total_minted_requests', (SELECT total_minted_requests FROM minted_stats),
    'pending_sig_fun', (SELECT pending_sig_fun FROM pending_stats),
    'pending_sig_count', (SELECT pending_sig_count FROM pending_stats),
    'users_with_wallet', jsonb_build_object(
      'count', (SELECT COUNT(*) FROM enriched_users WHERE has_wallet OR (wallet_address IS NOT NULL AND wallet_address != '')),
      'total_fun', (SELECT COALESCE(SUM(total_fun), 0) FROM enriched_users WHERE has_wallet OR (wallet_address IS NOT NULL AND wallet_address != ''))
    ),
    'users_without_wallet', jsonb_build_object(
      'count', (SELECT COUNT(*) FROM enriched_users WHERE NOT has_wallet AND (wallet_address IS NULL OR wallet_address = '')),
      'total_fun', (SELECT COALESCE(SUM(total_fun), 0) FROM enriched_users WHERE NOT has_wallet AND (wallet_address IS NULL OR wallet_address = ''))
    ),
    'top_users', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'user_id', eu.user_id,
          'username', eu.username,
          'avatar_url', eu.avatar_url,
          'total_fun', eu.total_fun,
          'action_count', eu.action_count,
          'has_wallet', eu.has_wallet,
          'public_wallet_address', eu.public_wallet_address,
          'wallet_address', eu.wallet_address
        ) ORDER BY eu.total_fun DESC
      ), '[]'::jsonb)
      FROM enriched_users eu
    )
  ) INTO result;

  RETURN result;
END;
$function$;
