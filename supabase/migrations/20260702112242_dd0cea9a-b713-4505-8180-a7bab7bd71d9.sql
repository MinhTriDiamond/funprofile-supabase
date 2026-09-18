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
$function$;

-- Chạy ngay để giải phóng backlog T6/2026
SELECT public.auto_flip_pending_light_actions();