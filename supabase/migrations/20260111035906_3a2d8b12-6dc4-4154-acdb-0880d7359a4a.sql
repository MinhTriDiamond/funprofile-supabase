-- Fix overly permissive RLS policies for account_merge_requests table
-- These policies incorrectly use USING (true) / WITH CHECK (true) instead of proper service_role check

DROP POLICY IF EXISTS "Service role can insert merge requests" ON account_merge_requests;
DROP POLICY IF EXISTS "Service role can update merge requests" ON account_merge_requests;

-- Create proper service role policies with correct check
CREATE POLICY "Service role can insert merge requests"
ON account_merge_requests FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update merge requests"
ON account_merge_requests FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- Fix overly permissive RLS policies for platform_user_data table
DROP POLICY IF EXISTS "Service role can insert platform data" ON platform_user_data;
DROP POLICY IF EXISTS "Service role can update platform data" ON platform_user_data;

-- Create proper service role policies with correct role restriction
CREATE POLICY "Service role can insert platform data"
ON platform_user_data FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update platform data"
ON platform_user_data FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);