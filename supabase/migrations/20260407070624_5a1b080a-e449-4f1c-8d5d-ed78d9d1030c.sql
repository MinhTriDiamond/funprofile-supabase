
-- Drop old restrictive policies for attesters
DROP POLICY IF EXISTS "Attesters can view signing requests" ON public.pplp_mint_requests;
DROP POLICY IF EXISTS "Attesters can sign requests" ON public.pplp_mint_requests;

-- New: Attesters can view pending_sig, signing, and signed requests
CREATE POLICY "Attesters can view all pending and signing requests"
ON public.pplp_mint_requests
FOR SELECT
TO authenticated
USING (
  is_gov_attester(auth.uid()) 
  AND status IN ('pending_sig', 'signing', 'signed')
);

-- New: Attesters can update requests from pending_sig or signing status
CREATE POLICY "Attesters can sign pending and signing requests"
ON public.pplp_mint_requests
FOR UPDATE
TO authenticated
USING (
  is_gov_attester(auth.uid()) 
  AND status IN ('pending_sig', 'signing')
)
WITH CHECK (
  is_gov_attester(auth.uid()) 
  AND status IN ('pending_sig', 'signing', 'signed')
);
