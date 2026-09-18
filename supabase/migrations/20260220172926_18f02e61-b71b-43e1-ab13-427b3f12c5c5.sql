-- Drop incorrect policy (USING auth.role() with public role - wrong syntax)
DROP POLICY IF EXISTS "Service role can update light_actions" ON public.light_actions;

-- Create correct policy explicitly targeting service_role
-- Using TO service_role means this policy only applies when role = service_role
CREATE POLICY "service_role can update light_actions"
  ON public.light_actions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
