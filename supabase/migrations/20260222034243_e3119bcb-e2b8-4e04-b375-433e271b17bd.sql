-- Make public_profiles accessible to anon by granting SELECT on the view
-- The view itself doesn't need SECURITY DEFINER since we grant direct access
GRANT SELECT ON public.public_profiles TO anon;
GRANT SELECT ON public.public_profiles TO authenticated;