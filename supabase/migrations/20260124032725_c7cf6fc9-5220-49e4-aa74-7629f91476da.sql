-- Fix SECURITY DEFINER view issue - recreate as SECURITY INVOKER (default)
DROP VIEW IF EXISTS public.user_custodial_wallets;

-- Recreate view with explicit SECURITY INVOKER
CREATE VIEW public.user_custodial_wallets 
WITH (security_invoker = true)
AS
SELECT 
  id,
  user_id,
  wallet_address,
  chain_id,
  is_active,
  created_at,
  updated_at,
  last_activity_at
FROM public.custodial_wallets
WHERE user_id = auth.uid();

-- Grant access to the safe view
GRANT SELECT ON public.user_custodial_wallets TO authenticated;