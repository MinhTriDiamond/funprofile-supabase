-- Drop overly permissive policy
DROP POLICY IF EXISTS "Service role can manage all platform data" ON platform_user_data;

-- Tạo policies chi tiết hơn cho edge functions (service role)
-- Edge functions chỉ cần INSERT và UPDATE, không cần DELETE từ client
CREATE POLICY "Service role can insert platform data"
ON platform_user_data FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update platform data"
ON platform_user_data FOR UPDATE
USING (true)
WITH CHECK (true);

-- User có thể delete data của chính mình (nếu cần)
CREATE POLICY "Users can delete their own platform data"
ON platform_user_data FOR DELETE
USING (auth.uid() = user_id);