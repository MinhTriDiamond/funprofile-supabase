
UPDATE pplp_mint_requests
SET status = 'pending_sig',
    action_name = 'HELPING',
    nonce = 2,
    signature = NULL,
    multisig_signatures = '{}'::jsonb,
    multisig_completed_groups = '{}',
    tx_hash = NULL,
    submitted_at = NULL,
    confirmed_at = NULL,
    block_number = NULL,
    error_message = NULL,
    retry_count = 0,
    signed_at = NULL,
    signed_by = NULL,
    updated_at = now()
WHERE id = 'f1c33961-1e18-4eb4-b0d4-a876e63a0cb5'
  AND user_id = '59e5b182-65b2-47d5-965c-d39e48dec9da'
  AND status = 'failed';
