DROP FUNCTION IF EXISTS public.get_app_stats();

CREATE OR REPLACE FUNCTION public.get_app_stats()
RETURNS TABLE(
  total_users BIGINT,
  total_posts BIGINT,
  total_reactions BIGINT,
  total_camly_claimed NUMERIC,
  treasury_camly_received NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_treasury_spent NUMERIC;
  v_treasury_received NUMERIC;
BEGIN
  -- Get treasury spent from system_config (verified on-chain amount)
  SELECT COALESCE((value->>'amount')::NUMERIC, 0) INTO v_treasury_spent
  FROM system_config WHERE key = 'TREASURY_CAMLY_SPENT';
  
  -- Get treasury received from system_config
  SELECT COALESCE((value->>'amount')::NUMERIC, 0) INTO v_treasury_received
  FROM system_config WHERE key = 'TREASURY_CAMLY_RECEIVED';

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM profiles WHERE is_banned = false)::BIGINT AS total_users,
    (SELECT COUNT(*) FROM posts)::BIGINT AS total_posts,
    (SELECT COUNT(*) FROM reactions)::BIGINT AS total_reactions,
    v_treasury_spent AS total_camly_claimed,
    v_treasury_received AS treasury_camly_received;
END;
$$;