-- Snapshot pg_get_functiondef sau containment Đ9 (2026-08-14)
-- Chỉ còn 1 overload (3 tham số). Overload 2 tham số (không guard) đã DROP.
CREATE OR REPLACE FUNCTION public.recalculate_user_financial(p_user_id uuid, p_client_id text DEFAULT NULL::text, p_admin_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  v_updated INTEGER := 0;
  v_actor uuid := auth.uid();
BEGIN
  -- SECURITY: actor = phiên đăng nhập thật, KHÔNG tin p_admin_id do caller truyền
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can recalculate user financials';
  END IF;

  FOR rec IN
    SELECT 
      ft.user_id,
      ft.client_id,
      SUM(CASE WHEN ft.action = 'DEPOSIT' THEN ft.amount ELSE 0 END) as calc_deposit,
      SUM(CASE WHEN ft.action IN ('WITHDRAW', 'CLAIM_REWARD', 'SEND_MONEY') THEN ft.amount ELSE 0 END) as calc_withdraw,
      SUM(CASE WHEN ft.action = 'BET' THEN ft.amount ELSE 0 END) as calc_bet,
      SUM(CASE WHEN ft.action = 'WIN' THEN ft.amount ELSE 0 END) as calc_win,
      SUM(CASE WHEN ft.action = 'LOSS' THEN ft.amount ELSE 0 END) as calc_loss,
      SUM(CASE 
        WHEN ft.action IN ('WIN', 'CLAIM_REWARD', 'RECEIVE_MONEY', 'DEPOSIT', 'ADJUSTMENT_ADD') THEN ft.amount
        WHEN ft.action IN ('LOSS', 'SEND_MONEY', 'WITHDRAW', 'ADJUSTMENT_SUB') THEN -ft.amount
        ELSE 0
      END) as calc_profit
    FROM public.financial_transactions ft
    WHERE ft.user_id = p_user_id
      AND (p_client_id IS NULL OR ft.client_id = p_client_id)
    GROUP BY ft.user_id, ft.client_id
  LOOP
    UPDATE public.platform_financial_data
    SET 
      total_deposit = rec.calc_deposit,
      total_withdraw = rec.calc_withdraw,
      total_bet = rec.calc_bet,
      total_win = rec.calc_win,
      total_loss = rec.calc_loss,
      total_profit = rec.calc_profit,
      updated_at = now()
    WHERE user_id = rec.user_id AND client_id = rec.client_id;

    v_updated := v_updated + 1;
  END LOOP;

  -- Audit log: ghi actor thật (auth.uid()), không phải p_admin_id
  INSERT INTO public.audit_logs (admin_id, action, target_user_id, details)
  VALUES (
    v_actor,
    'recalculate_user_financial',
    p_user_id,
    jsonb_build_object(
      'client_id', p_client_id,
      'platforms_updated', v_updated,
      'claimed_admin_id', p_admin_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'client_id', p_client_id,
    'platforms_updated', v_updated
  );
END;
$function$
