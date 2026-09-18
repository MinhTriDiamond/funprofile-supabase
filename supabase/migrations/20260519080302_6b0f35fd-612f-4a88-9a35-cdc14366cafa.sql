CREATE OR REPLACE VIEW public.pet_arena_public
WITH (security_invoker = off) AS
SELECT
  user_id,
  name,
  level,
  risk_tier,
  updated_at
FROM public.pet_states;

GRANT SELECT ON public.pet_arena_public TO authenticated, anon;