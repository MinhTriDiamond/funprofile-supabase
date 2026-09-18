-- A. Nâng LIMIT 500 → 1000 cho RPC get_attester_mint_requests (phiên bản 1 tham số)
CREATE OR REPLACE FUNCTION public.get_attester_mint_requests(wallet_addr text)
 RETURNS TABLE(id uuid, user_id uuid, recipient_address text, amount_wei text, amount_display numeric, evidence_hash text, action_types text[], action_name text, action_hash text, nonce bigint, status text, multisig_signatures jsonb, multisig_required_groups text[], multisig_completed_groups text[], created_at timestamp with time zone, updated_at timestamp with time zone, profile_username text, profile_avatar_url text, error_message text)
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
    p.username AS profile_username, p.avatar_url AS profile_avatar_url,
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

-- B. RPC tổng hợp stats toàn bảng (không bị LIMIT)
CREATE OR REPLACE FUNCTION public.get_attester_dashboard_stats(wallet_addr text)
 RETURNS TABLE(
   pending_sig_count bigint, pending_sig_fun numeric,
   signing_count bigint, signing_fun numeric,
   signed_count bigint, signed_fun numeric,
   rejected_24h_count bigint, rejected_24h_fun numeric,
   confirmed_count bigint, confirmed_fun numeric,
   total_in_dashboard bigint,
   is_capped boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
BEGIN
  IF NOT is_gov_attester(wallet_addr) THEN
    RAISE EXCEPTION 'Not a GOV attester wallet';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending_sig')                                                AS pending_sig_count,
      COALESCE(SUM(amount_display) FILTER (WHERE status = 'pending_sig'), 0)::numeric              AS pending_sig_fun,
      COUNT(*) FILTER (WHERE status = 'signing')                                                    AS signing_count,
      COALESCE(SUM(amount_display) FILTER (WHERE status = 'signing'), 0)::numeric                  AS signing_fun,
      COUNT(*) FILTER (WHERE status = 'signed')                                                     AS signed_count,
      COALESCE(SUM(amount_display) FILTER (WHERE status = 'signed'), 0)::numeric                   AS signed_fun,
      COUNT(*) FILTER (WHERE status = 'rejected' AND updated_at > now() - INTERVAL '24 hours')     AS rejected_24h_count,
      COALESCE(SUM(amount_display) FILTER (WHERE status = 'rejected' AND updated_at > now() - INTERVAL '24 hours'), 0)::numeric AS rejected_24h_fun,
      COUNT(*) FILTER (WHERE status = 'confirmed')                                                  AS confirmed_count,
      COALESCE(SUM(amount_display) FILTER (WHERE status = 'confirmed'), 0)::numeric                AS confirmed_fun
    FROM pplp_mint_requests
  )
  SELECT
    a.pending_sig_count, a.pending_sig_fun,
    a.signing_count, a.signing_fun,
    a.signed_count, a.signed_fun,
    a.rejected_24h_count, a.rejected_24h_fun,
    a.confirmed_count, a.confirmed_fun,
    (a.pending_sig_count + a.signing_count + a.signed_count + a.rejected_24h_count) AS total_in_dashboard,
    ((a.pending_sig_count + a.signing_count + a.signed_count + a.rejected_24h_count) >= 1000) AS is_capped
  FROM agg a;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_attester_dashboard_stats(text) TO authenticated;