-- Add action_name and action_hash columns for PPLP contract v1.2.1 compatibility
ALTER TABLE pplp_mint_requests 
ADD COLUMN IF NOT EXISTS action_name TEXT NOT NULL DEFAULT 'light_action';

ALTER TABLE pplp_mint_requests 
ADD COLUMN IF NOT EXISTS action_hash TEXT;

-- Make deadline nullable since contract v1.2.1 doesn't use it
ALTER TABLE pplp_mint_requests 
ALTER COLUMN deadline DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN pplp_mint_requests.action_name IS 'Action name string passed to lockWithPPLP (e.g., light_action)';
COMMENT ON COLUMN pplp_mint_requests.action_hash IS 'keccak256(bytes(action_name)) - must match contract PPLP_TYPEHASH';