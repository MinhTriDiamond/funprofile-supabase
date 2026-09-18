CREATE OR REPLACE FUNCTION public.get_my_profile_private()
RETURNS TABLE (email text, email_verified_at timestamptz, cross_platform_data jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email, p.email_verified_at, p.cross_platform_data
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_private() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;