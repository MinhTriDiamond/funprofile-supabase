-- =====================================================================
-- Auto-flip Light Actions: eligible→approved cron
-- =====================================================================
-- Vấn đề: light_actions có is_eligible=true nhưng mint_status='pending'
-- không có cơ chế tự động flip → tích lũy → Aggregation Guard chặn snapshot
-- (sự cố T5/2026: 388 QUEST_REWARD kẹt pending).
--
-- Giải pháp: cron daily 23:00 UTC (trước snapshot 1h):
--   1. Flip is_eligible=true + pending → approved
--   2. Flip is_eligible=false + pending → rejected (cleanup)
--   3. Log số lượng vào pplp_v2_event_log để audit.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.auto_flip_pending_light_actions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approved_count INT := 0;
  v_rejected_count INT := 0;
  v_cutoff TIMESTAMPTZ := now() - interval '1 hour'; -- chừa 1h cho action mới
BEGIN
  -- 1. eligible + pending → approved
  WITH upd AS (
    UPDATE light_actions
    SET mint_status = 'approved', updated_at = now()
    WHERE mint_status = 'pending'
      AND is_eligible = true
      AND created_at < v_cutoff
    RETURNING id
  )
  SELECT COUNT(*) INTO v_approved_count FROM upd;

  -- 2. ineligible + pending → rejected (cleanup, không mint)
  WITH upd AS (
    UPDATE light_actions
    SET mint_status = 'rejected', updated_at = now()
    WHERE mint_status = 'pending'
      AND is_eligible = false
      AND created_at < v_cutoff
    RETURNING id
  )
  SELECT COUNT(*) INTO v_rejected_count FROM upd;

  -- 3. Audit log
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
$$;

REVOKE ALL ON FUNCTION public.auto_flip_pending_light_actions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_flip_pending_light_actions() TO service_role;

-- Cron daily 23:00 UTC (trước snapshot monthly 00:05 UTC ngày 1)
SELECT cron.schedule(
  'light-actions-auto-flip-daily',
  '0 23 * * *',
  $$SELECT public.auto_flip_pending_light_actions();$$
);