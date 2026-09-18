
-- Prevent duplicate pending claims per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_claims_one_active_per_user 
ON pending_claims (user_id) 
WHERE status IN ('pending', 'processing');
