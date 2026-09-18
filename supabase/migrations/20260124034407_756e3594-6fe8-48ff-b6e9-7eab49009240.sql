-- Fix: Restrict wallet address visibility in public profiles
-- The main fix was already applied - the "Anon can view basic profile info" policy was dropped
-- and public_profiles view was recreated without wallet fields

-- Just need to add the authenticated policy (the own profile one already exists)
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);