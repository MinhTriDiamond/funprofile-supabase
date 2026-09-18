
-- Fix: Make the view use security_invoker instead of security_definer
DROP VIEW IF EXISTS public.public_light_reputation;

CREATE VIEW public.public_light_reputation
WITH (security_invoker = on) AS
SELECT
  user_id,
  total_light_score,
  tier,
  actions_count,
  total_minted
FROM public.light_reputation;

-- Re-grant access
GRANT SELECT ON public.public_light_reputation TO anon, authenticated;

-- Add a policy so anon can read light_reputation through the view (limited columns via view)
CREATE POLICY "Anon can read reputation via view"
ON public.light_reputation
FOR SELECT
TO anon
USING (true);
