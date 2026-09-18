CREATE OR REPLACE FUNCTION public.run_financial_reconciliation(p_admin_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB := '[]'::jsonb;
  rec RECORD;
  v_level INTEGER := 1;
  v_status TEXT := 'ok';
  v_total_checked INTEGER := 0;
  v_total_mismatched INTEGER := 0;
  v_auto_adjusted INTEGER := 0;
  v_diff_percent NUMERIC;
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

  -- Rate-limit: chỉ áp cho lần GHI (apply), tránh chặn bước xem trước
  IF NOT p_dry_run THEN
    SELECT max(run_at) INTO v_last_apply
    FROM public.reconciliation_logs
    WHERE notes IS NULL OR notes NOT LIKE '[DRY-RUN]%';

    IF v_last_apply IS NOT NULL AND v_last_apply > now() - interval '5 minutes' THEN
      RAISE EXCEPTION 'Reconciliation was applied less than 5 minutes ago, please wait';
    END IF;
  END IF;

  FOR rec IN
    SELECT 
      pfd.user_id,
      pfd.client_id,
      pfd.total_profit as stored_profit,
      COALESCE(calc.calculated_profit, 0) as calculated_profit,
      ABS(pfd.total_profit - COALESCE(calc.calculated_profit, 0)) as diff,
      CASE 
        WHEN pfd.total_profit = 0 THEN 0
        ELSE ABS(pfd.total_profit - COALESCE(calc.calculated_profit, 0))::NUMERIC / GREATEST(ABS(pfd.total_profit), 1) * 100
      END as diff_percent
    FROM public.platform_financial_data pfd
    LEFT JOIN (
      SELECT 
        user_id,
        client_id,
        SUM(CASE 
          WHEN action IN ('WIN', 'CLAIM_REWARD', 'RECEIVE_MONEY', 'DEPOSIT', 'ADJUSTMENT_ADD') THEN amount
          WHEN action IN ('LOSS', 'SEND_MONEY', 'WITHDRAW', 'ADJUSTMENT_SUB') THEN -amount
          ELSE 0
        END) as calculated_profit
      FROM public.financial_transactions
      GROUP BY user_id, client_id
    ) calc ON pfd.user_id = calc.user_id AND pfd.client_id = calc.client_id
  LOOP
    v_total_checked := v_total_checked + 1;
    v_diff_percent := rec.diff_percent;

    IF rec.diff > 0 THEN
      v_total_mismatched := v_total_mismatched + 1;

      IF v_diff_percent < 0.01 THEN
        IF NOT p_dry_run THEN
          UPDATE public.platform_financial_data
          SET total_profit = rec.calculated_profit, updated_at = now()
          WHERE user_id = rec.user_id AND client_id = rec.client_id;
        END IF;
        v_auto_adjusted := v_auto_adjusted + 1;

        IF v_level < 2 THEN v_level := 1; END IF;
        IF v_status = 'ok' THEN v_status := 'minor_adjustment'; END IF;

      ELSIF v_diff_percent < 1 THEN
        IF v_level < 3 THEN v_level := 2; END IF;
        IF v_status IN ('ok', 'minor_adjustment') THEN v_status := 'mismatch'; END IF;

      ELSE
        v_level := 3;
        v_status := 'critical';
      END IF;

      result := result || jsonb_build_object(
        'user_id', rec.user_id,
        'client_id', rec.client_id,
        'stored', rec.stored_profit,
        'calculated', rec.calculated_profit,
        'diff', rec.diff,
        'diff_percent', round(v_diff_percent::NUMERIC, 4),
        'level', CASE 
          WHEN v_diff_percent < 0.01 THEN 1
          WHEN v_diff_percent < 1 THEN 2
          ELSE 3
        END
      );
    END IF;
  END LOOP;

  INSERT INTO public.reconciliation_logs (
    status, level, discrepancies, total_checked, total_mismatched, auto_adjusted, run_by, notes
  )
  VALUES (
    v_status, v_level, result, v_total_checked, v_total_mismatched, ((NOT p_dry_run) AND v_auto_adjusted > 0), v_actor,
    format('%sChecked %s records, found %s mismatches (%s %s), claimed_admin_id=%s',
      CASE WHEN p_dry_run THEN '[DRY-RUN] ' ELSE '' END,
      v_total_checked, v_total_mismatched, v_auto_adjusted,
      CASE WHEN p_dry_run THEN 'would be auto-adjusted' ELSE 'auto-adjusted' END,
      COALESCE(p_admin_id::text, 'null'))
  );

  INSERT INTO public.audit_logs (admin_id, action, target_user_id, details)
  VALUES (
    v_actor,
    'run_financial_reconciliation',
    NULL,
    jsonb_build_object(
      'dry_run', p_dry_run,
      'total_checked', v_total_checked,
      'total_mismatched', v_total_mismatched,
      'auto_adjusted', v_auto_adjusted,
      'status', v_status,
      'level', v_level,
      'claimed_admin_id', p_admin_id
    )
  );

  RETURN jsonb_build_object(
    'status', v_status,
    'level', v_level,
    'dry_run', p_dry_run,
    'total_checked', v_total_checked,
    'total_mismatched', v_total_mismatched,
    'auto_adjusted', v_auto_adjusted,
    'discrepancies', result
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.run_financial_reconciliation(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_financial_reconciliation(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.run_financial_reconciliation(uuid, boolean) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.run_financial_reconciliation(uuid);