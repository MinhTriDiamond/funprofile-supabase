-- =============================================================
-- FUN Money Mint Package — 02_functions.sql
-- Các DB function bắt buộc để mint chạy.
-- Yêu cầu chạy SAU 01_schema.sql.
-- =============================================================

-- Function update_updated_at_column (nếu chưa có)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.auto_flip_pending_light_actions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_approved_count INT := 0;
  v_rejected_count INT := 0;
  v_cutoff TIMESTAMPTZ := now() - interval '1 hour';
BEGIN
  WITH upd AS (
    UPDATE light_actions
    SET mint_status = 'approved'
    WHERE mint_status = 'pending'
      AND is_eligible = true
      AND created_at < v_cutoff
    RETURNING id
  )
  SELECT COUNT(*) INTO v_approved_count FROM upd;

  WITH upd AS (
    UPDATE light_actions
    SET mint_status = 'rejected'
    WHERE mint_status = 'pending'
      AND is_eligible = false
      AND created_at < v_cutoff
    RETURNING id
  )
  SELECT COUNT(*) INTO v_rejected_count FROM upd;

  INSERT INTO pplp_v2_event_log (event_type, reference_table, payload)
  VALUES (
    'light_actions.auto_flip',
    'light_actions',
    jsonb_build_object(
      'approved', v_approved_count,
      'rejected', v_rejected_count,
      'cutoff', v_cutoff,
      'ran_at', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'approved', v_approved_count,
    'rejected', v_rejected_count
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_user_mint_stats(search_query text DEFAULT ''::text)
 RETURNS TABLE(user_id uuid, username text, avatar_url text, wallet_address text, total_actions bigint, total_light_score numeric, epoch_allocated numeric, pending_count bigint, signed_count bigint, submitted_count bigint, confirmed_count bigint, failed_count bigint, total_minted numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id AS user_id,
    p.username,
    p.avatar_url,
    COALESCE(cw.wallet_address, p.wallet_address) AS wallet_address,
    COALESCE(la.total_actions, 0)::bigint AS total_actions,
    COALESCE(la.total_light_score, 0) AS total_light_score,
    COALESCE(ma.epoch_allocated, 0) AS epoch_allocated,
    COALESCE(mr.pending_count, 0)::bigint AS pending_count,
    COALESCE(mr.signed_count, 0)::bigint AS signed_count,
    COALESCE(mr.submitted_count, 0)::bigint AS submitted_count,
    COALESCE(mr.confirmed_count, 0)::bigint AS confirmed_count,
    COALESCE(mr.failed_count, 0)::bigint AS failed_count,
    COALESCE(mr.total_minted, 0) AS total_minted
  FROM profiles p
  LEFT JOIN custodial_wallets cw ON cw.user_id = p.id AND cw.is_active = true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total_actions,
      SUM(light_score) AS total_light_score
    FROM light_actions
    WHERE light_actions.user_id = p.id
  ) la ON true
  LEFT JOIN LATERAL (
    SELECT
      SUM(allocation_amount_capped) AS epoch_allocated
    FROM mint_allocations
    WHERE mint_allocations.user_id = p.id
  ) ma ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('pending_sig', 'signing')) AS pending_count,
      COUNT(*) FILTER (WHERE status = 'signed') AS signed_count,
      COUNT(*) FILTER (WHERE status = 'submitted') AS submitted_count,
      COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
      SUM(CASE WHEN status = 'confirmed' THEN COALESCE(amount_display, 0) ELSE 0 END) AS total_minted
    FROM pplp_mint_requests
    WHERE pplp_mint_requests.user_id = p.id
  ) mr ON true
  WHERE
    (COALESCE(la.total_actions, 0) > 0 OR COALESCE(mr.pending_count, 0) + COALESCE(mr.signed_count, 0) + COALESCE(mr.submitted_count, 0) + COALESCE(mr.confirmed_count, 0) + COALESCE(mr.failed_count, 0) > 0)
    AND (search_query = '' OR p.username ILIKE '%' || search_query || '%')
  ORDER BY COALESCE(la.total_light_score, 0) DESC;
$function$
;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
