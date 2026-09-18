
-- Function kiểm tra user có phải GOV attester không
CREATE OR REPLACE FUNCTION public.is_gov_attester(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = check_user_id
      AND public_wallet_address IS NOT NULL
      AND LOWER(public_wallet_address) IN (
        LOWER('0xe32d50a0badE4cbD5B0d6120d3A5FD07f63694f1'),
        LOWER('0xfd0Da7a744245e7aCECCd786d5a743Ef9291a557'),
        LOWER('0x02D5578173bd0DB25462BB32A254Cd4b2E6D9a0D'),
        LOWER('0xCa319fBc39F519822385F2D0a0114B14fa89A301'),
        LOWER('0x699CC96A8C4E3555f95Bd620EC4A218155641E09'),
        LOWER('0x5102Ecc4a458a1af76aFA50d23359a712658a402'),
        LOWER('0x0e1b399E4a88eB11dd0f77cc21E9B54835f6d385'),
        LOWER('0x38db3eC4e14946aE497992e6856216641D22c242'),
        LOWER('0x9ec8C51175526BEbB1D04100256De71CF99B7CCC')
      )
  );
$$;

-- RLS: Attester có thể đọc các request đang cần ký
CREATE POLICY "Attesters can view signing requests"
ON public.pplp_mint_requests
FOR SELECT
USING (
  is_gov_attester(auth.uid())
  AND status IN ('pending_sig', 'signing', 'signed')
);

-- RLS: Attester có thể cập nhật multisig fields
CREATE POLICY "Attesters can sign requests"
ON public.pplp_mint_requests
FOR UPDATE
USING (
  is_gov_attester(auth.uid())
  AND status IN ('pending_sig', 'signing')
);
