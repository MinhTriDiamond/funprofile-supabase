
-- Drop and recreate public_profiles view with additional columns
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles WITH (security_invoker = true) AS
SELECT
  p.id,
  p.username,
  p.username_normalized,
  p.avatar_url,
  p.bio,
  p.cover_url,
  p.created_at,
  p.full_name,
  p.display_name,
  p.social_links,
  p.public_wallet_address,
  p.is_banned,
  p.location,
  p.workplace,
  p.education,
  p.relationship_status
FROM profiles p;

GRANT SELECT ON public.public_profiles TO anon;
GRANT SELECT ON public.public_profiles TO authenticated;
