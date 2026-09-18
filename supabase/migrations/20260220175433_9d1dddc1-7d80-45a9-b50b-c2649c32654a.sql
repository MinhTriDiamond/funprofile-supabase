-- Add actor_id column to light_actions for proper anti-duplicate tracking
-- actor_id = người thực hiện hành động (reactor, commenter)
-- user_id = người được thưởng (post owner)
ALTER TABLE public.light_actions 
ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES public.profiles(id);

-- Add unique constraint to prevent duplicate rewards per (actor, post, action)
-- This prevents like→unlike→like from rewarding twice
CREATE UNIQUE INDEX IF NOT EXISTS light_actions_actor_ref_type_unique
ON public.light_actions (actor_id, reference_id, action_type)
WHERE actor_id IS NOT NULL AND reference_id IS NOT NULL;

-- RLS policy for actor_id column (service_role can update)
-- Already covered by existing service_role update policy
