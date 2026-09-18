-- Rename action_hash to evidence_hash in pplp_mint_requests table
ALTER TABLE pplp_mint_requests RENAME COLUMN action_hash TO evidence_hash;