-- Fix 1: Drop the overly permissive anon SELECT policy on profiles
-- Anon users should use the public_profiles view which only exposes safe fields
DROP POLICY IF EXISTS "Anon can view basic profile info" ON public.profiles;

-- Also tighten the authenticated policy - authenticated users can see all profiles
-- but we keep this since they are logged-in users (not anonymous)
-- The public_profiles view is the safe way for public/anon access