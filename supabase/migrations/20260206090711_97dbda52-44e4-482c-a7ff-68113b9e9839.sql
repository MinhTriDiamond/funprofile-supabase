-- =============================================
-- PPLP Mint Requests Table
-- Tracks all on-chain mint requests for PPLP system
-- =============================================

CREATE TABLE IF NOT EXISTS pplp_mint_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  recipient_address TEXT NOT NULL,
  amount_wei TEXT NOT NULL, -- Wei amount as string to handle big numbers
  amount_display NUMERIC NOT NULL, -- Human readable FUN amount
  action_hash TEXT NOT NULL, -- keccak256 hash of action types
  action_types TEXT[] NOT NULL DEFAULT '{}',
  nonce BIGINT NOT NULL,
  deadline BIGINT NOT NULL,
  
  -- Status flow: pending_sig → signed → submitted → confirmed | failed
  status TEXT NOT NULL DEFAULT 'pending_sig',
  
  -- Signature data (filled when admin signs)
  signature TEXT,
  signed_at TIMESTAMPTZ,
  signed_by TEXT, -- Attester wallet address
  
  -- Transaction data (filled when submitted to chain)
  tx_hash TEXT,
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  block_number BIGINT,
  
  -- Error handling
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  
  -- Linked light_actions
  action_ids UUID[] NOT NULL DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_pplp_mint_requests_status ON pplp_mint_requests(status);
CREATE INDEX IF NOT EXISTS idx_pplp_mint_requests_user ON pplp_mint_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_pplp_mint_requests_created ON pplp_mint_requests(created_at DESC);

-- Enable RLS
ALTER TABLE pplp_mint_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own requests
CREATE POLICY "Users can view their own mint requests"
ON pplp_mint_requests FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all requests
CREATE POLICY "Admins can view all mint requests"
ON pplp_mint_requests FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- System (service role) can insert
CREATE POLICY "Service role can insert mint requests"
ON pplp_mint_requests FOR INSERT
WITH CHECK (true);

-- Admins can update (for signing and submitting)
CREATE POLICY "Admins can update mint requests"
ON pplp_mint_requests FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can update
CREATE POLICY "Service role can update mint requests"
ON pplp_mint_requests FOR UPDATE
USING (auth.role() = 'service_role');

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_pplp_mint_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pplp_mint_requests_updated_at ON pplp_mint_requests;
CREATE TRIGGER trigger_pplp_mint_requests_updated_at
  BEFORE UPDATE ON pplp_mint_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_pplp_mint_requests_updated_at();

-- Add mint_request_id to light_actions for tracking
ALTER TABLE light_actions 
ADD COLUMN IF NOT EXISTS mint_request_id UUID REFERENCES pplp_mint_requests(id);

CREATE INDEX IF NOT EXISTS idx_light_actions_mint_request ON light_actions(mint_request_id);