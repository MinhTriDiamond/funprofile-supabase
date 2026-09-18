UPDATE pplp_mint_requests 
SET status = 'pending_sig',
    multisig_signatures = '{}'::jsonb,
    multisig_completed_groups = '{}'::text[]
WHERE status IN ('signed', 'signing');