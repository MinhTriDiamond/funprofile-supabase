-- 1. Cập nhật hàm is_gov_attester(uuid) với đầy đủ 11 địa chỉ
CREATE OR REPLACE FUNCTION public.is_gov_attester(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = check_user_id
      AND public_wallet_address IS NOT NULL
      AND LOWER(public_wallet_address) IN (
        -- Will (3): Minh Trí, Ánh Nguyệt, Thu Trang
        LOWER('0xe32d50a0badE4cbD5B0d6120d3A5FD07f63694f1'),
        LOWER('0xfd0Da7a744245e7aCECCd786d5a743Ef9291a557'),
        LOWER('0x02D5578173bd0DB25462BB32A254Cd4b2E6D9a0D'),
        -- Wisdom (4): Bé Giàu, Bé Ngọc, Ái Vân, Minh Trí Test 1
        LOWER('0xCa319fBc39F519822385F2D0a0114B14fa89A301'),
        LOWER('0xDf8249159BB67804D718bc8186f95B75CE5ECbe8'),
        LOWER('0x5102Ecc4a458a1af76aFA50d23359a712658a402'),
        LOWER('0xE3e97a95d3f61814473f6d1eEbBa8253286D65c5'),
        -- Love (4): Thanh Tiên, Bé Kim, Bé Hà, Minh Trí Test 2
        LOWER('0xE418a560611e80E4239F5513D41e583fC9AC2E6d'),
        LOWER('0x67464Df3082828b3Cf10C5Cb08FC24A28228EFd1'),
        LOWER('0x9ec8C51175526BEbB1D04100256De71CF99B7CCC'),
        LOWER('0x57a7943F2808Fc24b0403f25bb4670c5d84b3f2e')
      )
  );
$$;

-- 2. Cập nhật RLS SELECT: bỏ pending_sig, chỉ cho phép signing + signed
DROP POLICY IF EXISTS "Attesters can view signing requests" ON public.pplp_mint_requests;
CREATE POLICY "Attesters can view signing requests"
ON public.pplp_mint_requests
FOR SELECT
TO authenticated
USING (
  is_gov_attester(auth.uid())
  AND status IN ('signing', 'signed')
);

-- 3. Cập nhật RLS UPDATE: bỏ pending_sig, chỉ cho phép signing
DROP POLICY IF EXISTS "Attesters can sign requests" ON public.pplp_mint_requests;
CREATE POLICY "Attesters can sign requests"
ON public.pplp_mint_requests
FOR UPDATE
TO authenticated
USING (
  is_gov_attester(auth.uid())
  AND status IN ('signing')
)
WITH CHECK (
  is_gov_attester(auth.uid())
  AND status IN ('signing', 'signed')
);