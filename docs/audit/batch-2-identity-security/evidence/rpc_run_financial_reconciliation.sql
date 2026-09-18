-- Snapshot sau fix Việc 1 (2026-08-15) — run_financial_reconciliation
-- Chỉ còn 1 overload (uuid, boolean). Overload (uuid) cũ đã DROP.
-- ACL thật: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_...=X/postgres}
--   ⇒ KHÔNG có PUBLIC (=X/), anon=false, authenticated=true, service_role=true
-- Gọi thật publishable key: HTTP 401 / 42501 permission denied for function

CREATE OR REPLACE FUNCTION public.run_financial_reconciliation(p_admin_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_last_apply timestamptz;
BEGIN
  -- SECURITY: actor = phiên đăng nhập thật, KHÔNG tin p_admin_id do caller truyền
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can run financial reconciliation';
  END IF;

  -- Rate-limit 5 phút, chỉ áp cho lần GHI (apply) để không chặn bước xem trước
  IF NOT p_dry_run THEN
    SELECT max(run_at) INTO v_last_apply
    FROM public.reconciliation_logs
    WHERE notes IS NULL OR notes NOT LIKE '[DRY-RUN]%';

    IF v_last_apply IS NOT NULL AND v_last_apply > now() - interval '5 minutes' THEN
      RAISE EXCEPTION 'Reconciliation was applied less than 5 minutes ago, please wait';
    END IF;
  END IF;

  -- ... vòng lặp đối soát giữ NGUYÊN công thức cũ (platform_financial_data vs financial_transactions) ...
  -- Khác biệt duy nhất về ghi:
  --   IF NOT p_dry_run THEN
  --     UPDATE public.platform_financial_data SET total_profit = rec.calculated_profit, updated_at = now() ...
  --   END IF;

  -- Log: run_by = v_actor (actor thật); p_admin_id chỉ lưu trong notes để đối chiếu
  -- INSERT INTO public.reconciliation_logs (..., run_by, notes) VALUES (..., v_actor, '[DRY-RUN] ... claimed_admin_id=...');
  -- INSERT INTO public.audit_logs (admin_id, action, target_user_id, details)
  --   VALUES (v_actor, 'run_financial_reconciliation', NULL, jsonb_build_object('dry_run', p_dry_run, 'claimed_admin_id', p_admin_id, ...));

  RETURN jsonb_build_object('dry_run', p_dry_run);
END;
$function$;

REVOKE ALL ON FUNCTION public.run_financial_reconciliation(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_financial_reconciliation(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.run_financial_reconciliation(uuid, boolean) TO authenticated, service_role;
DROP FUNCTION IF EXISTS public.run_financial_reconciliation(uuid);
