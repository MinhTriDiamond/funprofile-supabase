-- Drop the overly permissive anonymous SELECT policy on reward_claims
-- This policy exposes sensitive financial data (amounts, wallet addresses) to unauthenticated users
DROP POLICY IF EXISTS "Anon can read reward claims" ON public.reward_claims;