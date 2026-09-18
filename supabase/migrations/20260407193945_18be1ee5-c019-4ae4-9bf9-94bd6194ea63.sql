CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_mint_per_user 
ON pplp_mint_requests (user_id) 
WHERE status IN ('pending_sig', 'signing', 'signed', 'submitted');