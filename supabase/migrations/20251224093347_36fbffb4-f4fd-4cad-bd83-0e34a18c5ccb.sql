-- Fix the security definer view issue by recreating the view with SECURITY INVOKER
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles 
WITH (security_invoker = true) AS
SELECT 
  id, 
  username, 
  avatar_url, 
  bio, 
  cover_url, 
  created_at,
  full_name
FROM profiles;

-- Grant access to the view
GRANT SELECT ON public.public_profiles TO anon, authenticated;