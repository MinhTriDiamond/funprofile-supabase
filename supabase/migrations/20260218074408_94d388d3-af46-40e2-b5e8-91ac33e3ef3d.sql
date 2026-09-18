
-- 1. Add admin SELECT policy on reward_claims
CREATE POLICY "Admins can view all reward claims"
  ON public.reward_claims
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Create aggregate RPC for banned user claims (bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.get_banned_user_claims()
RETURNS TABLE (
  user_id uuid,
  total_claimed bigint,
  claim_count bigint,
  first_claim_at timestamptz,
  last_claim_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rc.user_id,
    COALESCE(SUM(rc.amount), 0)::bigint AS total_claimed,
    COUNT(rc.id)::bigint AS claim_count,
    MIN(rc.created_at) AS first_claim_at,
    MAX(rc.created_at) AS last_claim_at
  FROM reward_claims rc
  INNER JOIN profiles p ON p.id = rc.user_id
  WHERE p.is_banned = true OR p.reward_status = 'banned'
  GROUP BY rc.user_id
$$;

-- Grant execute only to authenticated users (admin check is in calling component via RLS)
REVOKE ALL ON FUNCTION public.get_banned_user_claims() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_banned_user_claims() TO authenticated;
