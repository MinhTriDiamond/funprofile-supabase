
-- Step 1: Update profiles - change reward_status from on_hold to approved
UPDATE public.profiles
SET reward_status = 'approved'
WHERE username IN ('angelaivan', 'angeldieungoc', 'AngelGiau', 'leminhtri')
  AND reward_status = 'on_hold';

-- Step 2: Resolve SHARED_DEVICE fraud signals
UPDATE public.pplp_fraud_signals
SET is_resolved = true,
    resolution = 'Admin verified: legitimate family/test accounts, not farm'
WHERE actor_id IN (
  SELECT id FROM public.profiles WHERE username IN ('angelaivan', 'angeldieungoc', 'AngelGiau', 'leminhtri')
)
AND signal_type = 'SHARED_DEVICE'
AND (is_resolved = false OR is_resolved IS NULL);

-- Step 3: Reset fraud_flags in pplp_user_tiers
UPDATE public.pplp_user_tiers
SET fraud_flags = 0
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE username IN ('angelaivan', 'angeldieungoc', 'AngelGiau', 'leminhtri')
)
AND fraud_flags > 0;
