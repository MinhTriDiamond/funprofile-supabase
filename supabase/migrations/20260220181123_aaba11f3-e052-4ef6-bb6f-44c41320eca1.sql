
-- Fix 1: Drop old CHECK constraint and recreate with 'pending_sig' and 'confirmed'
ALTER TABLE public.light_actions 
DROP CONSTRAINT IF EXISTS light_actions_mint_status_check;

ALTER TABLE public.light_actions
ADD CONSTRAINT light_actions_mint_status_check 
CHECK (mint_status = ANY (ARRAY[
  'pending'::text, 
  'approved'::text, 
  'pending_sig'::text,
  'minted'::text, 
  'rejected'::text, 
  'expired'::text,
  'confirmed'::text
]));

-- Fix 4: Data cleanup — link orphan actions to their existing mint requests

-- Step A: Actions from active/pending requests → set to pending_sig
UPDATE public.light_actions la
SET 
  mint_status = 'pending_sig',
  mint_request_id = subq.mint_request_id
FROM (
  SELECT unnest(action_ids) as action_id, id as mint_request_id
  FROM pplp_mint_requests
  WHERE status IN ('pending_sig', 'signed', 'submitted')
) subq
WHERE la.id = subq.action_id
AND la.mint_request_id IS NULL;

-- Step B: Actions from confirmed requests → set to minted
UPDATE public.light_actions la
SET 
  mint_status = 'minted',
  mint_request_id = subq.mint_request_id
FROM (
  SELECT unnest(action_ids) as action_id, id as mint_request_id
  FROM pplp_mint_requests
  WHERE status = 'confirmed'
) subq
WHERE la.id = subq.action_id
AND la.mint_request_id IS NULL;
