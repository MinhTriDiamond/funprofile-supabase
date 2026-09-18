-- Fix security definer view issue
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles 
WITH (security_invoker = true)
AS
SELECT 
  id, username, username_normalized, avatar_url, bio, cover_url, 
  created_at, full_name, display_name, social_links, public_wallet_address,
  is_banned
FROM profiles;

GRANT SELECT ON public.public_profiles TO anon;
GRANT SELECT ON public.public_profiles TO authenticated;