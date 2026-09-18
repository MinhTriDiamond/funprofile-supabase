-- Add SELECT policy for search_logs: Users can view their own search logs
CREATE POLICY "Users can view their own search logs"
ON public.search_logs FOR SELECT
USING (auth.uid() = user_id);

-- Add DELETE policy for search_logs: Users can delete their own search logs
CREATE POLICY "Users can delete their own search logs"
ON public.search_logs FOR DELETE
USING (auth.uid() = user_id);