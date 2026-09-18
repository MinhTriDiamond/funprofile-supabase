-- Allow users to update status of their own transactions
CREATE POLICY "Users can update their own transactions"
ON public.transactions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for pplp_mint_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.pplp_mint_requests;