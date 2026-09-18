
-- Create a restricted public view for leaderboard (only safe fields)
CREATE OR REPLACE VIEW public.public_light_reputation AS
SELECT
  user_id,
  total_light_score,
  tier,
  actions_count,
  total_minted
FROM public.light_reputation;

-- Grant access to the view
GRANT SELECT ON public.public_light_reputation TO anon, authenticated;

-- Drop the overly permissive SELECT policy that exposes all columns
DROP POLICY IF EXISTS "Anyone can view top reputations for leaderboard" ON public.light_reputation;

-- The "Users can view their own reputation" policy already exists, keeping it
