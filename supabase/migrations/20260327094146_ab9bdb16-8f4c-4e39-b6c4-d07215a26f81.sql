
CREATE OR REPLACE FUNCTION public.get_all_claim_history()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  amount numeric,
  wallet_address text,
  created_at timestamptz,
  username text,
  full_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rc.id,
    rc.user_id,
    rc.amount,
    rc.wallet_address,
    rc.created_at,
    COALESCE(p.username, '') as username,
    p.full_name,
    p.avatar_url
  FROM public.reward_claims rc
  LEFT JOIN public.profiles p ON p.id = rc.user_id
  ORDER BY rc.created_at DESC;
$$;
