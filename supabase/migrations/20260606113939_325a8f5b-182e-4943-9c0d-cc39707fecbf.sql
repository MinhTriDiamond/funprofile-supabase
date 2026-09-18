-- Drop existing overloads to allow return-type change
DROP FUNCTION IF EXISTS public.get_attester_mint_requests(wallet_addr text, p_request_id uuid);
DROP FUNCTION IF EXISTS public.get_attester_mint_requests(wallet_addr text);

-- Overload 1: fetch all requests for dashboard
CREATE OR REPLACE FUNCTION public.get_attester_mint_requests(wallet_addr text)
RETURNS TABLE(
  id uuid, user_id uuid, recipient_address text, amount_wei text, amount_display numeric,
  evidence_hash text, action_types text[], action_name text, action_hash text, nonce bigint,
  status text, multisig_signatures jsonb, multisig_required_groups text[], multisig_completed_groups text[],
  created_at timestamp with time zone, updated_at timestamp with time zone,
  profile_username text, profile_full_name text, profile_avatar_url text, error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_gov_attester(wallet_addr) THEN
    RAISE EXCEPTION 'Not a GOV attester wallet';
  END IF;

  RETURN QUERY
  SELECT 
    r.id, r.user_id, r.recipient_address, r.amount_wei, r.amount_display,
    r.evidence_hash, r.action_types, r.action_name, r.action_hash, r.nonce,
    r.status, r.multisig_signatures, r.multisig_required_groups, r.multisig_completed_groups,
    r.created_at, r.updated_at,
    p.username AS profile_username, p.full_name AS profile_full_name, p.avatar_url AS profile_avatar_url,
    r.error_message
  FROM pplp_mint_requests r
  LEFT JOIN profiles p ON p.id = r.user_id
  WHERE r.status IN ('pending_sig', 'signing', 'signed')
     OR (r.status = 'rejected' AND r.updated_at > now() - INTERVAL '24 hours')
  ORDER BY 
    CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END,
    r.created_at DESC
  LIMIT 1000;
END;
$function$;

-- Overload 2: fetch single request for signing
CREATE OR REPLACE FUNCTION public.get_attester_mint_requests(wallet_addr text, p_request_id uuid)
RETURNS TABLE(
  id uuid, user_id uuid, recipient_address text, amount_wei text, amount_display numeric,
  evidence_hash text, action_types text[], action_name text, action_hash text, nonce bigint,
  status text, multisig_signatures jsonb, multisig_required_groups text[], multisig_completed_groups text[],
  created_at timestamp with time zone, updated_at timestamp with time zone,
  profile_username text, profile_full_name text, profile_avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_gov_attester(wallet_addr) THEN
    RAISE EXCEPTION 'Not a GOV attester wallet';
  END IF;

  RETURN QUERY
  SELECT 
    r.id, r.user_id, r.recipient_address, r.amount_wei, r.amount_display,
    r.evidence_hash, r.action_types, r.action_name, r.action_hash, r.nonce,
    r.status, r.multisig_signatures, r.multisig_required_groups, r.multisig_completed_groups,
    r.created_at, r.updated_at,
    p.username AS profile_username, p.full_name AS profile_full_name, p.avatar_url AS profile_avatar_url
  FROM pplp_mint_requests r
  LEFT JOIN profiles p ON p.id = r.user_id
  WHERE r.id = p_request_id;
END;
$function$;