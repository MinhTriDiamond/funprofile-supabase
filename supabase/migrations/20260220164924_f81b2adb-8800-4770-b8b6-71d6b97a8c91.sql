-- Cho phép edge function (service role) cập nhật mint_status và mint_request_id trên light_actions
CREATE POLICY "Service role can update light_actions"
  ON public.light_actions
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');