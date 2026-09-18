
-- Allow anonymous users to read basic profile info (needed for feed, posts, gift cards)
-- This is safe because profiles only contain public-facing info (username, avatar, display_name)
-- Sensitive data like email is NOT in profiles table
CREATE POLICY "Anyone can view basic profiles"
ON public.profiles
FOR SELECT
TO anon
USING (true);

-- Update public_profiles view to include display_name for proper name display
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = on) AS
SELECT 
  id,
  username,
  avatar_url,
  bio,
  cover_url,
  created_at,
  full_name,
  display_name
FROM profiles;
