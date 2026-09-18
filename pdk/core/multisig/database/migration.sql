-- =============================================
-- PPLP Mint Requests - Multisig 3-of-3
-- Migration Template cho FUN Play / ANGEL AI
-- =============================================

-- 1. Bảng chính: pplp_mint_requests
CREATE TABLE IF NOT EXISTS public.pplp_mint_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User info
  user_id UUID NOT NULL,
  recipient_address TEXT NOT NULL,
  
  -- Action & Amount
  action_ids UUID[] NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL DEFAULT 'POST_CREATE',
  amount NUMERIC NOT NULL DEFAULT 0,
  amount_wei TEXT,
  
  -- EIP-712 signing data
  action_hash TEXT,
  evidence_hash TEXT,
  nonce TEXT,
  
  -- Multisig 3-of-3 (WILL + WISDOM + LOVE)
  multisig_signatures JSONB NOT NULL DEFAULT '{}',
  multisig_completed_groups TEXT[] NOT NULL DEFAULT '{}',
  multisig_required_groups TEXT[] NOT NULL DEFAULT ARRAY['will', 'wisdom', 'love'],
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending_sig',
  -- Possible values: pending_sig, signing, signed, submitted, confirmed, failed, expired, rejected
  
  -- On-chain result
  tx_hash TEXT,
  on_chain_error TEXT,
  confirmed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  
  -- Platform identifier (để phân biệt request từ platform nào)
  platform_id TEXT NOT NULL DEFAULT 'fun_profile',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 hour')
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_pplp_mint_requests_user_id ON public.pplp_mint_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_pplp_mint_requests_status ON public.pplp_mint_requests(status);
CREATE INDEX IF NOT EXISTS idx_pplp_mint_requests_platform ON public.pplp_mint_requests(platform_id);
CREATE INDEX IF NOT EXISTS idx_pplp_mint_requests_created ON public.pplp_mint_requests(created_at DESC);

-- 3. Function: Kiểm tra user có phải GOV attester không
-- Hỗ trợ cả UUID (auth.uid()) và wallet address
CREATE OR REPLACE FUNCTION public.is_gov_attester(check_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  gov_addresses TEXT[] := ARRAY[
    -- WILL
    '0xe32d50a0bade4cbd5b0d6120d3a5fd07f63694f1',
    '0xfd0da7a744245e7aceccd786d5a743ef9291a557',
    '0x02d5578173bd0db25462bb32a254cd4b2e6d9a0d',
    -- WISDOM
    '0xca319fbc39f519822385f2d0a0114b14fa89a301',
    '0xdf8249159bb67804d718bc8186f95b75ce5ecbe8',
    '0x5102ecc4a458a1af76afa50d23359a712658a402',
    '0xe3e97a95d3f61814473f6d1eebba8253286d65c5',
    -- LOVE
    '0xe418a560611e80e4239f5513d41e583fc9ac2e6d',
    '0x67464df3082828b3cf10c5cb08fc24a28228efd1',
    '0x9ec8c51175526bebb1d04100256de71cf99b7ccc',
    '0x57a7943f2808fc24b0403f25bb4670c5d84b3f2e'
  ];
BEGIN
  -- Kiểm tra wallet address (lowercase)
  IF lower(check_id) = ANY(gov_addresses) THEN
    RETURN TRUE;
  END IF;
  
  -- Kiểm tra UUID - tìm trong profiles.wallet_address
  IF check_id ~ '^[0-9a-f]{8}-' THEN
    RETURN EXISTS (
      SELECT 1 FROM profiles
      WHERE id = check_id::UUID
      AND lower(wallet_address) = ANY(gov_addresses)
    );
  END IF;
  
  RETURN FALSE;
END;
$$;

-- 4. RLS Policies
ALTER TABLE public.pplp_mint_requests ENABLE ROW LEVEL SECURITY;

-- User có thể xem request của chính mình
CREATE POLICY "Users can view own mint requests"
ON public.pplp_mint_requests FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Attester chỉ xem được request đang ký hoặc đã ký (không thấy pending_sig)
CREATE POLICY "Attesters can view signing requests"
ON public.pplp_mint_requests FOR SELECT
TO authenticated
USING (
  status IN ('signing', 'signed')
  AND is_gov_attester(auth.uid()::TEXT)
);

-- Attester có thể cập nhật chữ ký
CREATE POLICY "Attesters can update signatures"
ON public.pplp_mint_requests FOR UPDATE
TO authenticated
USING (
  status IN ('pending_sig', 'signing', 'signed')
  AND is_gov_attester(auth.uid()::TEXT)
)
WITH CHECK (
  status IN ('pending_sig', 'signing', 'signed')
  AND is_gov_attester(auth.uid()::TEXT)
);

-- User có thể tạo request cho chính mình
CREATE POLICY "Users can create own mint requests"
ON public.pplp_mint_requests FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 5. Auto-update updated_at
CREATE OR REPLACE FUNCTION update_pplp_mint_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pplp_mint_requests_updated_at
  BEFORE UPDATE ON public.pplp_mint_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_pplp_mint_requests_updated_at();

-- 6. Enable Realtime (để frontend nhận thông báo khi có chữ ký mới)
ALTER PUBLICATION supabase_realtime ADD TABLE public.pplp_mint_requests;
