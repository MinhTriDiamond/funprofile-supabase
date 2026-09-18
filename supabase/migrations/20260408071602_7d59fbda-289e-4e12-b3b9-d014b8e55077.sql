
CREATE OR REPLACE FUNCTION public.get_user_mint_stats(search_query text DEFAULT '')
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  wallet_address text,
  total_actions bigint,
  total_light_score numeric,
  epoch_allocated numeric,
  pending_count bigint,
  signed_count bigint,
  submitted_count bigint,
  confirmed_count bigint,
  failed_count bigint,
  total_minted numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.username,
    p.avatar_url,
    COALESCE(cw.wallet_address, p.wallet_address) AS wallet_address,
    COALESCE(la.total_actions, 0)::bigint AS total_actions,
    COALESCE(la.total_light_score, 0) AS total_light_score,
    COALESCE(ma.epoch_allocated, 0) AS epoch_allocated,
    COALESCE(mr.pending_count, 0)::bigint AS pending_count,
    COALESCE(mr.signed_count, 0)::bigint AS signed_count,
    COALESCE(mr.submitted_count, 0)::bigint AS submitted_count,
    COALESCE(mr.confirmed_count, 0)::bigint AS confirmed_count,
    COALESCE(mr.failed_count, 0)::bigint AS failed_count,
    COALESCE(mr.total_minted, 0) AS total_minted
  FROM profiles p
  LEFT JOIN custodial_wallets cw ON cw.user_id = p.id AND cw.is_active = true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total_actions,
      SUM(light_score) AS total_light_score
    FROM light_actions
    WHERE light_actions.user_id = p.id
  ) la ON true
  LEFT JOIN LATERAL (
    SELECT
      SUM(allocation_amount_capped) AS epoch_allocated
    FROM mint_allocations
    WHERE mint_allocations.user_id = p.id
  ) ma ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('pending_sig', 'signing')) AS pending_count,
      COUNT(*) FILTER (WHERE status = 'signed') AS signed_count,
      COUNT(*) FILTER (WHERE status = 'submitted') AS submitted_count,
      COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
      SUM(CASE WHEN status = 'confirmed' THEN COALESCE(amount_display, 0) ELSE 0 END) AS total_minted
    FROM pplp_mint_requests
    WHERE pplp_mint_requests.user_id = p.id
  ) mr ON true
  WHERE
    (COALESCE(la.total_actions, 0) > 0 OR COALESCE(mr.pending_count, 0) + COALESCE(mr.signed_count, 0) + COALESCE(mr.submitted_count, 0) + COALESCE(mr.confirmed_count, 0) + COALESCE(mr.failed_count, 0) > 0)
    AND (search_query = '' OR p.username ILIKE '%' || search_query || '%')
  ORDER BY COALESCE(la.total_light_score, 0) DESC;
$$;
