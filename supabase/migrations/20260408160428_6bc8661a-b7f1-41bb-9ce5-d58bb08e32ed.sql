CREATE OR REPLACE FUNCTION public.get_attester_mint_requests(wallet_addr TEXT)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  recipient_address TEXT,
  amount_wei TEXT,
  amount_display NUMERIC,
  evidence_hash TEXT,
  action_types TEXT[],
  action_name TEXT,
  action_hash TEXT,
  nonce BIGINT,
  status TEXT,
  multisig_signatures JSONB,
  multisig_required_groups TEXT[],
  multisig_completed_groups TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  profile_username TEXT,
  profile_avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_gov_attester(wallet_addr) THEN
    RAISE EXCEPTION 'Not a GOV attester wallet';
  END IF;

  RETURN QUERY
  SELECT 
    r.id,
    r.user_id,
    r.recipient_address,
    r.amount_wei,
    r.amount_display,
    r.evidence_hash,
    r.action_types,
    r.action_name,
    r.action_hash,
    r.nonce,
    r.status,
    r.multisig_signatures,
    r.multisig_required_groups,
    r.multisig_completed_groups,
    r.created_at,
    r.updated_at,
    p.username AS profile_username,
    p.avatar_url AS profile_avatar_url
  FROM pplp_mint_requests r
  LEFT JOIN profiles p ON p.id = r.user_id
  WHERE r.status IN ('pending_sig', 'signing', 'signed', 'confirmed')
  ORDER BY r.created_at DESC;
END;
$$;