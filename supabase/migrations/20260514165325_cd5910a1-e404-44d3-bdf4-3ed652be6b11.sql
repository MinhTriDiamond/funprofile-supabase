CREATE OR REPLACE FUNCTION public.mystery_box_check_premium_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_threshold constant numeric := 10000000; -- 10M CAMLY
  v_inv uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.mystery_box_premium_grants WHERE user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.pplp_v2_balance_ledger
  WHERE user_id = NEW.user_id AND token_symbol = 'CAMLY';

  IF v_balance >= v_threshold THEN
    BEGIN
      SELECT public.mystery_box_grant(
        NEW.user_id,
        'legendary_box',
        'premium_purchase',
        NULL
      ) INTO v_inv;

      INSERT INTO public.mystery_box_premium_grants (user_id, trigger_balance, inventory_id)
      VALUES (NEW.user_id, v_balance, v_inv);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'mystery_box_check_premium_grant failed for user %: %', NEW.user_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;