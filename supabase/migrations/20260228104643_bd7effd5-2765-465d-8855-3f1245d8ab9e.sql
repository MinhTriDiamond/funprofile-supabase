
-- Fix legacy "signed" requests that have 0 multisig signatures (pre-multisig era)
-- Mark them as 'legacy_signed' to distinguish from properly multisig-signed requests
UPDATE public.pplp_mint_requests
SET status = 'legacy_signed'
WHERE status = 'signed'
  AND (multisig_completed_groups IS NULL OR multisig_completed_groups = '{}')
  AND (multisig_signatures IS NULL OR multisig_signatures::text = '{}');
