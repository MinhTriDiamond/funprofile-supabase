CREATE OR REPLACE VIEW public.v_internal_addresses AS  SELECT DISTINCT addr
   FROM ( SELECT lower(cw.wallet_address) AS addr
           FROM custodial_wallets_archive_20261015 cw
          WHERE ((cw.wallet_address IS NOT NULL) AND (cw.wallet_address <> ''::text))
        UNION ALL
         SELECT lower(p.public_wallet_address) AS lower
           FROM profiles p
          WHERE ((p.public_wallet_address IS NOT NULL) AND (p.public_wallet_address <> ''::text))
        UNION ALL
         SELECT lower(p.btc_address) AS lower
           FROM profiles p
          WHERE ((p.btc_address IS NOT NULL) AND (p.btc_address <> ''::text))
        UNION ALL
         SELECT lower(a.address) AS lower
           FROM profile_btc_aux_addresses a
          WHERE ((a.address IS NOT NULL) AND (a.address <> ''::text))) s
  WHERE (addr IS NOT NULL);

CREATE OR REPLACE FUNCTION public.get_user_mint_stats(search_query text DEFAULT ''::text)
 RETURNS TABLE(user_id uuid, username text, avatar_url text, wallet_address text, total_actions bigint, total_light_score numeric, epoch_allocated numeric, pending_count bigint, signed_count bigint, submitted_count bigint, confirmed_count bigint, failed_count bigint, total_minted numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'permission denied: authentication required'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin role required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.username,
    p.avatar_url,
    p.wallet_address AS wallet_address,
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
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_actions, SUM(light_score) AS total_light_score
    FROM light_actions WHERE light_actions.user_id = p.id
  ) la ON true
  LEFT JOIN LATERAL (
    SELECT SUM(allocation_amount_capped) AS epoch_allocated
    FROM mint_allocations WHERE mint_allocations.user_id = p.id
  ) ma ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('pending_sig', 'signing')) AS pending_count,
      COUNT(*) FILTER (WHERE status = 'signed') AS signed_count,
      COUNT(*) FILTER (WHERE status = 'submitted') AS submitted_count,
      COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
      SUM(CASE WHEN status = 'confirmed' THEN COALESCE(amount_display, 0) ELSE 0 END) AS total_minted
    FROM pplp_mint_requests WHERE pplp_mint_requests.user_id = p.id
  ) mr ON true
  WHERE
    (COALESCE(la.total_actions, 0) > 0 OR COALESCE(mr.pending_count, 0) + COALESCE(mr.signed_count, 0) + COALESCE(mr.submitted_count, 0) + COALESCE(mr.confirmed_count, 0) + COALESCE(mr.failed_count, 0) > 0)
    AND (search_query = '' OR p.username ILIKE '%' || search_query || '%')
  ORDER BY COALESCE(la.total_light_score, 0) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fun_profile_dry_run_emit_event(p_user_id uuid, p_event_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payload jsonb;
  v_did record;
  v_trust record;
  v_profile record;
  v_wallet record;
  v_sbt record;
  v_outbox_id uuid;
  v_aggregate text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_aggregate := p_user_id::text;

  IF p_event_type = 'PROFILE_UPDATED' THEN
    SELECT id, display_name, username, bio, avatar_url, cover_url, preferred_language, updated_at
      INTO v_profile FROM public.profiles WHERE id = p_user_id;
    IF v_profile.id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
    v_payload := jsonb_build_object(
      'platform_slug','fun-profile','origin_platform','fun-profile',
      'platform_user_id', v_profile.id::text,
      'display_name', v_profile.display_name,
      'username', v_profile.username,
      'bio', v_profile.bio,
      'avatar_url', v_profile.avatar_url,
      'cover_url', v_profile.cover_url,
      'preferred_language', v_profile.preferred_language,
      'updated_at', v_profile.updated_at,
      'dry_run', true,
      'nonce', gen_random_uuid()
    );

  ELSIF p_event_type = 'DID_PROMOTED' THEN
    SELECT did_id, entity_type, did_level, status, updated_at
      INTO v_did FROM public.did_registry WHERE owner_user_id = p_user_id ORDER BY did_level DESC LIMIT 1;
    IF v_did.did_id IS NULL THEN RAISE EXCEPTION 'did not found'; END IF;
    v_payload := jsonb_build_object(
      'platform_slug','fun-profile','origin_platform','fun-profile',
      'platform_user_id', v_aggregate,
      'did_id', v_did.did_id, 'entity_type', v_did.entity_type,
      'from_level', GREATEST(0, COALESCE(v_did.did_level,0)-1),
      'to_level', v_did.did_level, 'status', v_did.status,
      'promoted_at', v_did.updated_at,
      'dry_run', true, 'nonce', gen_random_uuid()
    );

  ELSIF p_event_type = 'TRUST_UPDATED' THEN
    SELECT t.did_id, t.tc, t.trust_tier, t.last_calculated_at
      INTO v_trust FROM public.trust_profile t
      JOIN public.did_registry d ON d.did_id = t.did_id
      WHERE d.owner_user_id = p_user_id LIMIT 1;
    IF v_trust.did_id IS NULL THEN RAISE EXCEPTION 'trust not found'; END IF;
    v_payload := jsonb_build_object(
      'platform_slug','fun-profile','origin_platform','fun-profile',
      'platform_user_id', v_aggregate,
      'did_id', v_trust.did_id, 'tc_score', v_trust.tc,
      'tier', v_trust.trust_tier, 'updated_at', v_trust.last_calculated_at,
      'dry_run', true, 'nonce', gen_random_uuid()
    );

  ELSIF p_event_type IN ('SBT_ISSUED','SBT_REVOKED') THEN
    SELECT s.* INTO v_sbt FROM public.sbt_registry s
      JOIN public.did_registry d ON d.did_id = s.did_id
      WHERE d.owner_user_id = p_user_id ORDER BY s.issued_at DESC LIMIT 1;
    IF v_sbt.token_id IS NULL THEN RAISE EXCEPTION 'sbt not found'; END IF;
    v_payload := jsonb_build_object(
      'platform_slug','fun-profile','origin_platform','fun-profile',
      'platform_user_id', v_aggregate,
      'did_id', v_sbt.did_id, 'token_id', v_sbt.token_id,
      'sbt_category', v_sbt.sbt_category, 'sbt_type', v_sbt.sbt_type,
      'issuer', v_sbt.issuer, 'issued_at', v_sbt.issued_at,
      'expires_at', v_sbt.expires_at, 'status', v_sbt.status,
      'trust_weight', v_sbt.trust_weight, 'privacy_level', v_sbt.privacy_level,
      'evidence_hash', v_sbt.evidence_hash,
      'metadata_safe', jsonb_build_object(
        'title', v_sbt.metadata->'title',
        'description', v_sbt.metadata->'description',
        'category', v_sbt.metadata->'category'
      ),
      'dry_run', true, 'nonce', gen_random_uuid()
    );

  ELSIF p_event_type IN ('WALLET_LINKED','WALLET_UNLINKED') THEN
    SELECT id AS user_id, public_wallet_address AS wallet_address, 56 AS chain_id, true AS is_active
      INTO v_wallet FROM public.profiles WHERE id = p_user_id AND public_wallet_address IS NOT NULL;
    IF v_wallet.user_id IS NULL THEN RAISE EXCEPTION 'wallet not found'; END IF;
    v_payload := jsonb_build_object(
      'platform_slug','fun-profile','origin_platform','fun-profile',
      'platform_user_id', v_aggregate,
      'wallet_address', lower(v_wallet.wallet_address),
      'wallet_address_hash', encode(digest(lower(v_wallet.wallet_address), 'sha256'), 'hex'),
      'chain_id', v_wallet.chain_id,
      'wallet_status', CASE WHEN p_event_type='WALLET_LINKED' THEN 'active' ELSE 'inactive' END,
      'wallet_kind', 'external',
      'dry_run', true, 'nonce', gen_random_uuid()
    );

  ELSE
    RAISE EXCEPTION 'unsupported event_type: %', p_event_type;
  END IF;

  v_outbox_id := public._emit_fp_event(p_event_type, v_aggregate, v_payload, true);

  INSERT INTO public.audit_logs(action, actor_id, target_type, target_id, metadata)
  VALUES ('federation_outbox_dry_run', auth.uid(), 'fun_profile_event_outbox',
          COALESCE(v_outbox_id::text, 'duplicate'),
          jsonb_build_object('event_type', p_event_type, 'target_user', p_user_id));

  RETURN jsonb_build_object(
    'ok', true,
    'outbox_id', v_outbox_id,
    'event_type', p_event_type,
    'aggregate_id', v_aggregate,
    'payload', v_payload
  );
END;
$function$
;
