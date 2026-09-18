
CREATE OR REPLACE FUNCTION public.get_pplp_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Only allow admins
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'total_approved_fun', (
      SELECT COALESCE(SUM(mint_amount), 0)::numeric
      FROM public.light_actions
      WHERE mint_status = 'approved'
    ),
    'total_approved_actions', (
      SELECT COUNT(*)
      FROM public.light_actions
      WHERE mint_status = 'approved'
    ),
    'total_minted_fun', (
      SELECT COALESCE(SUM(amount_display), 0)::numeric
      FROM public.pplp_mint_requests
      WHERE status = 'confirmed'
    ),
    'total_minted_requests', (
      SELECT COUNT(*)
      FROM public.pplp_mint_requests
      WHERE status = 'confirmed'
    ),
    'pending_sig_fun', (
      SELECT COALESCE(SUM(amount_display), 0)::numeric
      FROM public.pplp_mint_requests
      WHERE status = 'pending_sig'
    ),
    'pending_sig_count', (
      SELECT COUNT(*)
      FROM public.pplp_mint_requests
      WHERE status = 'pending_sig'
    ),
    'users_with_wallet', (
      SELECT jsonb_build_object(
        'count', COUNT(DISTINCT la.user_id),
        'total_fun', COALESCE(SUM(la.mint_amount), 0)::numeric
      )
      FROM public.light_actions la
      INNER JOIN public.profiles p ON p.id = la.user_id
      WHERE la.mint_status = 'approved'
        AND p.public_wallet_address IS NOT NULL
        AND p.public_wallet_address != ''
    ),
    'users_without_wallet', (
      SELECT jsonb_build_object(
        'count', COUNT(DISTINCT la.user_id),
        'total_fun', COALESCE(SUM(la.mint_amount), 0)::numeric
      )
      FROM public.light_actions la
      INNER JOIN public.profiles p ON p.id = la.user_id
      WHERE la.mint_status = 'approved'
        AND (p.public_wallet_address IS NULL OR p.public_wallet_address = '')
    ),
    'top_users', (
      SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'user_id', la.user_id,
          'username', p.username,
          'avatar_url', p.avatar_url,
          'total_fun', SUM(la.mint_amount)::numeric,
          'action_count', COUNT(la.id),
          'has_wallet', (p.public_wallet_address IS NOT NULL AND p.public_wallet_address != '')
        ) AS row_data
        FROM public.light_actions la
        INNER JOIN public.profiles p ON p.id = la.user_id
        WHERE la.mint_status = 'approved'
        GROUP BY la.user_id, p.username, p.avatar_url, p.public_wallet_address
        ORDER BY SUM(la.mint_amount) DESC
        LIMIT 20
      ) sub
    )
  ) INTO result;

  RETURN result;
END;
$$;
