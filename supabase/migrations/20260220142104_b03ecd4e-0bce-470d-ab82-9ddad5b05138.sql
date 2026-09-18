
-- Fix 1: Remove overly permissive anon SELECT policy on profiles
-- The public_profiles view (owned by postgres, bypasses RLS) provides safe public access
DROP POLICY IF EXISTS "Anyone can view basic profiles" ON public.profiles;

-- Update public_profiles view to include social_links and public_wallet_address 
-- (needed for Avatar Orbit and public profile display)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
  id,
  username,
  avatar_url,
  bio,
  cover_url,
  created_at,
  full_name,
  display_name,
  social_links,
  public_wallet_address
FROM profiles;

-- Fix 2: Hash OAuth client secrets using bcrypt via pgcrypto
-- First ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash existing plaintext secrets in place
UPDATE public.oauth_clients 
SET client_secret = crypt(client_secret, gen_salt('bf', 10))
WHERE client_secret NOT LIKE '$2a$%' AND client_secret NOT LIKE '$2b$%';
