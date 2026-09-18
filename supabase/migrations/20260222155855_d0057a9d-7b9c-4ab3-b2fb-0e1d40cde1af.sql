-- Allow anon to read public profile fields (for guest user directory)
CREATE POLICY "Anon can read public profiles"
ON public.profiles
FOR SELECT
TO anon
USING (true);

-- Allow anon to read reward_claims (for guest user directory stats)
CREATE POLICY "Anon can read reward claims"
ON public.reward_claims
FOR SELECT
TO anon
USING (true);