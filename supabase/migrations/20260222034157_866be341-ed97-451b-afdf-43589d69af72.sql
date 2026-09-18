DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles AS
SELECT 
  id, username, username_normalized, avatar_url, bio, cover_url, 
  created_at, full_name, display_name, social_links, public_wallet_address
FROM profiles;