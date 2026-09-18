-- Mở rộng auto-flip: xử lý mint request split_parent hỏng + queued_split treo
CREATE OR REPLACE FUNCTION public.auto_flip_recoverable_mint_allocations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch text := 'auto-flip-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD-HH24');
  v_count int := 0;
  v_stale_split int := 0;
  v_system_actor uuid := 'a97cbb6c-2d00-40e9-a35a-f181273b17bb'; -- funrichclub
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('auto_flip_recoverable_mint_allocations')) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'locked');
  END IF;

  -- (0) Guard: queued_split quá 24h mà không sinh child nào -> failed
  WITH stale AS (
    SELECT p.id
    FROM pplp_mint_requests p
    WHERE p.status = 'queued_split'
      AND p.created_at < now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM pplp_mint_requests c WHERE c.parent_request_id = p.id)
  ), upd_stale AS (
    UPDATE pplp_mint_requests
    SET status = 'failed',
        error_message = COALESCE(error_message,'') || ' split_never_executed: queued_split quá 24h không sinh child.',
        updated_at = now()
    WHERE id IN (SELECT id FROM stale)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_stale_split FROM upd_stale;

  -- (1) Reset allocation về pending cho các mint request không thể phục hồi
  WITH broken_parents AS (
    -- split_parent mà mọi child đã kết thúc và KHÔNG có child nào confirmed
    SELECT p.id
    FROM pplp_mint_requests p
    WHERE p.status = 'split_parent'
      AND EXISTS (SELECT 1 FROM pplp_mint_requests c WHERE c.parent_request_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM pplp_mint_requests c
        WHERE c.parent_request_id = p.id
          AND c.status NOT IN ('failed','rejected')
      )
  ),
  stuck AS (
    SELECT a.id AS alloc_id, a.user_id, a.epoch_id, e.epoch_month,
           a.mint_request_id AS old_mr_id, mr.status AS old_mr_status,
           a.allocation_amount_capped AS fun_amount,
           CASE WHEN mr.status = 'split_parent'
                THEN 'auto-flip cron: split_parent với toàn bộ child failed'
                ELSE 'auto-flip cron: failed/rejected mint request' END AS reason
    FROM mint_allocations a
    JOIN pplp_mint_requests mr ON mr.id = a.mint_request_id
    JOIN mint_epochs e ON e.id = a.epoch_id
    WHERE a.status = 'claimed'
      AND (
        mr.status IN ('failed','rejected')
        OR mr.id IN (SELECT id FROM broken_parents)
      )
  ),
  audit_insert AS (
    INSERT INTO pplp_v2_event_log (event_type, payload, created_at)
    SELECT 'mint_allocation_reset_recoverable',
           jsonb_build_object(
             'alloc_id', alloc_id, 'user_id', user_id, 'epoch_month', epoch_month,
             'old_mint_request_id', old_mr_id, 'old_status', old_mr_status,
             'fun_amount', fun_amount,
             'reason', reason,
             'batch', v_batch
           ),
           now()
    FROM stuck
    RETURNING 1
  ),
  notif_insert AS (
    INSERT INTO notifications (user_id, actor_id, type, metadata, created_at)
    SELECT s.user_id, v_system_actor, 'epoch_reset_info',
           jsonb_build_object(
             'epoch_month', s.epoch_month,
             'fun_amount', s.fun_amount,
             'alloc_id', s.alloc_id,
             'batch', v_batch,
             'message', '💛 Lệnh mint ' || s.fun_amount || ' FUN của bạn (tháng ' || s.epoch_month || ') đã được mở lại — vui lòng vào ví bấm "Claim lại" để nhận token nhé.'
           ),
           now()
    FROM stuck s
    WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = s.user_id)
    RETURNING 1
  ),
  upd AS (
    UPDATE mint_allocations
    SET status = 'pending', mint_request_id = NULL, updated_at = now()
    WHERE id IN (SELECT alloc_id FROM stuck)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM upd;

  RETURN jsonb_build_object(
    'success', true,
    'reset_count', v_count,
    'stale_queued_split_failed', v_stale_split,
    'batch', v_batch
  );
END;
$function$;