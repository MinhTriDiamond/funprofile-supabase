-- A1 đợt 2, mục 2: guard admin cho 2 function đọc chỉ dùng ở dashboard admin.
-- Nguyên tắc: actor = auth.uid(), REVOKE phải có PUBLIC.

CREATE OR REPLACE FUNCTION public.get_banned_user_claims()
RETURNS TABLE(user_id uuid, total_claimed bigint, claim_count bigint, first_claim_at timestamp with time zone, last_claim_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
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
    RAISE EXCEPTION 'Only admins can access banned user claims';
  END IF;

  RETURN QUERY
  SELECT
    rc.user_id,
    COALESCE(SUM(rc.amount), 0)::bigint AS total_claimed,
    COUNT(*)::bigint AS claim_count,
    MIN(rc.created_at) AS first_claim_at,
    MAX(rc.created_at) AS last_claim_at
  FROM public.reward_claims rc
  JOIN public.profiles p ON p.id = rc.user_id
  WHERE p.is_banned = true
  GROUP BY rc.user_id
  ORDER BY total_claimed DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_banned_user_claims() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_banned_user_claims() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_mint_stats(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_mint_stats(text) TO authenticated, service_role;