
-- Reset light_actions linked to these mint requests back to pending
UPDATE public.light_actions
SET mint_status = 'pending', mint_request_id = NULL, minted_at = NULL
WHERE mint_request_id IN (
  SELECT id FROM public.pplp_mint_requests
  WHERE id::text LIKE 'c2949f%' OR id::text LIKE 'a37c9a%' OR id::text LIKE 'fdbfd4%'
);

-- Delete the 3 mint requests
DELETE FROM public.pplp_mint_requests
WHERE id::text LIKE 'c2949f%' OR id::text LIKE 'a37c9a%' OR id::text LIKE 'fdbfd4%';
