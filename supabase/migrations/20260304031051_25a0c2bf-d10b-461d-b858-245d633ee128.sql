-- Add explicit deny policies for INSERT/UPDATE/DELETE on user_roles
-- Only service_role (which bypasses RLS) should manage roles
-- This prevents any authenticated user from escalating privileges

CREATE POLICY "No client insert on user_roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No client update on user_roles"
  ON public.user_roles FOR UPDATE
  USING (false);

CREATE POLICY "No client delete on user_roles"
  ON public.user_roles FOR DELETE
  USING (false);