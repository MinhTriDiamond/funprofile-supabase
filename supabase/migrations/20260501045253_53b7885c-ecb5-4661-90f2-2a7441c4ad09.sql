-- Tăng tốc RPC ký duyệt: thêm overload nhận request_id để chỉ trả 1 dòng, tránh timeout khi list lớn
CREATE OR REPLACE FUNCTION public.get_attester_mint_requests(wallet_addr text, p_request_id uuid)
RETURNS TABLE(id uuid, user_id uuid, recipient_address text, amount_wei text, amount_display numeric, evidence_hash text, action_types text[], action_name text, action_hash text, nonce bigint, status text, multisig_signatures jsonb, multisig_required_groups text[], multisig_completed_groups text[], created_at timestamp with time zone, updated_at timestamp with time zone, profile_username text, profile_avatar_url text)
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
    p.username AS profile_username, p.avatar_url AS profile_avatar_url
  FROM pplp_mint_requests r
  LEFT JOIN profiles p ON p.id = r.user_id
  WHERE r.id = p_request_id;
END;
$function$;

-- Loại 'confirmed' khỏi list cũ + giới hạn 500 dòng để tránh timeout
CREATE OR REPLACE FUNCTION public.get_attester_mint_requests(wallet_addr text)
RETURNS TABLE(id uuid, user_id uuid, recipient_address text, amount_wei text, amount_display numeric, evidence_hash text, action_types text[], action_name text, action_hash text, nonce bigint, status text, multisig_signatures jsonb, multisig_required_groups text[], multisig_completed_groups text[], created_at timestamp with time zone, updated_at timestamp with time zone, profile_username text, profile_avatar_url text)
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
    p.username AS profile_username, p.avatar_url AS profile_avatar_url
  FROM pplp_mint_requests r
  LEFT JOIN profiles p ON p.id = r.user_id
  WHERE r.status IN ('pending_sig', 'signing', 'signed')
  ORDER BY r.created_at DESC
  LIMIT 500;
END;
$function$;