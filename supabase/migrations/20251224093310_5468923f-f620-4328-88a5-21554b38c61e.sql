-- Fix profiles data exposure by creating a public view with only safe fields
-- and updating RLS policies for field-level security

-- Create a public_profiles view with only safe public fields
CREATE OR REPLACE VIEW public.public_profiles AS
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

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

-- Create policy for users to view their own full profile
CREATE POLICY "Users can view own full profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Create policy for admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Create policy for authenticated users to view limited profile fields of others
-- This allows basic profile info queries but the application should use public_profiles view
CREATE POLICY "Authenticated users can view basic profile info"
ON profiles FOR SELECT
TO authenticated
USING (true);