
CREATE OR REPLACE FUNCTION public.apply_attester_signature(
  p_request_id uuid,
  p_group text,
  p_signer_address text,
  p_signer_name text,
  p_signature text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_current_sigs jsonb;
  v_required_groups text[];
  v_effective_required text[];
  v_next_sigs jsonb;
  v_completed_groups text[];
  v_is_full boolean;
  v_signed_at timestamptz := now();
  v_first_sig text;
  v_new_status text;
BEGIN
  -- Lock row để tránh race condition giữa các nhóm GOV cùng ký
  SELECT id, status, multisig_signatures, multisig_required_groups, multisig_completed_groups
    INTO v_row
  FROM public.pplp_mint_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'NOT_FOUND', 'message', 'Không tìm thấy request');
  END IF;

  -- Chỉ cho phép ký khi đang ở các trạng thái hợp lệ
  IF v_row.status NOT IN ('pending_sig', 'signing', 'signed') THEN
    RETURN jsonb_build_object(
      'code', 'INVALID_STATUS',
      'message', format('Request đang ở trạng thái %s, không thể ký.', v_row.status),
      'status', v_row.status
    );
  END IF;

  v_current_sigs := COALESCE(v_row.multisig_signatures, '{}'::jsonb);
  v_required_groups := COALESCE(v_row.multisig_required_groups, ARRAY[]::text[]);
  v_effective_required := CASE
    WHEN array_length(v_required_groups, 1) IS NULL THEN ARRAY['will','wisdom','love']
    ELSE v_required_groups
  END;

  -- Đã ký rồi (sau khi lock — đây là check chính xác)
  IF v_current_sigs ? p_group THEN
    RETURN jsonb_build_object(
      'code', 'ALREADY_SIGNED',
      'message', format('Nhóm %s đã ký request này rồi.', p_group),
      'status', v_row.status,
      'multisig_completed_groups', v_row.multisig_completed_groups
    );
  END IF;

  -- Đã hoàn tất 3/3
  IF v_row.status = 'signed' THEN
    RETURN jsonb_build_object(
      'code', 'ALREADY_COMPLETED',
      'message', 'Request này đã đủ chữ ký GOV.',
      'status', v_row.status
    );
  END IF;

  -- Build next state
  v_next_sigs := v_current_sigs || jsonb_build_object(
    p_group, jsonb_build_object(
      'signer', p_signer_address,
      'signature', p_signature,
      'signed_at', v_signed_at,
      'signer_name', p_signer_name
    )
  );

  SELECT array_agg(g ORDER BY idx)
    INTO v_completed_groups
  FROM (
    SELECT g, idx
    FROM unnest(ARRAY['will','wisdom','love']) WITH ORDINALITY AS t(g, idx)
    WHERE g = ANY(v_effective_required) AND v_next_sigs ? g
  ) sub;

  v_is_full := (
    SELECT bool_and(v_next_sigs ? g)
    FROM unnest(v_effective_required) AS g
  );

  v_first_sig := v_next_sigs->'will'->>'signature';
  v_new_status := CASE WHEN v_is_full THEN 'signed' ELSE 'signing' END;

  UPDATE public.pplp_mint_requests
  SET multisig_signatures = v_next_sigs,
      multisig_completed_groups = COALESCE(v_completed_groups, ARRAY[]::text[]),
      signature = CASE WHEN v_is_full THEN p_signature ELSE COALESCE(v_first_sig, signature) END,
      signed_by = p_signer_address,
      signed_at = v_signed_at,
      status = v_new_status,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'code', 'OK',
    'status', v_new_status,
    'multisig_signatures', v_next_sigs,
    'multisig_completed_groups', COALESCE(v_completed_groups, ARRAY[]::text[]),
    'is_fully_signed', v_is_full
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_attester_signature(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_attester_signature(uuid, text, text, text, text) TO service_role;
