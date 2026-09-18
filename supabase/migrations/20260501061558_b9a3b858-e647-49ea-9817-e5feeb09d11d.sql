-- Hard cap 1.05M FUN/tháng/user cho mint requests
-- Áp dụng tại tầng DB qua trigger BEFORE INSERT/UPDATE để bao mọi nguồn

CREATE OR REPLACE FUNCTION public.enforce_monthly_mint_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap NUMERIC := 1050000;       -- 1.05M FUN/tháng/user
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
  v_existing_total NUMERIC := 0;
  v_new_total NUMERIC;
BEGIN
  -- Bỏ qua các trạng thái không tiêu hao quota
  IF NEW.status IN ('rejected', 'failed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  v_month_start := date_trunc('month', COALESCE(NEW.created_at, now()));
  v_month_end := v_month_start + INTERVAL '1 month';

  -- Tổng các request đang chiếm quota của user trong tháng (loại request hiện tại nếu UPDATE)
  SELECT COALESCE(SUM(amount_display), 0)
  INTO v_existing_total
  FROM public.pplp_mint_requests
  WHERE user_id = NEW.user_id
    AND created_at >= v_month_start
    AND created_at < v_month_end
    AND status NOT IN ('rejected', 'failed', 'cancelled')
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  v_new_total := v_existing_total + COALESCE(NEW.amount_display, 0);

  IF v_new_total > v_cap THEN
    RAISE EXCEPTION 'Monthly mint cap exceeded: user % đã có %/% FUN trong tháng, request mới % FUN sẽ vượt cap (% FUN)',
      NEW.user_id, v_existing_total, v_cap, NEW.amount_display, v_cap
      USING ERRCODE = 'check_violation',
            HINT = 'Cap 1.050.000 FUN/tháng/user. Vui lòng giảm khối lượng hoặc chờ epoch sau.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_monthly_mint_cap ON public.pplp_mint_requests;
CREATE TRIGGER trg_enforce_monthly_mint_cap
BEFORE INSERT OR UPDATE OF amount_display, status ON public.pplp_mint_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_monthly_mint_cap();

COMMENT ON FUNCTION public.enforce_monthly_mint_cap() IS
'Hard cap 1.050.000 FUN/tháng/user cho pplp_mint_requests. Tính tổng theo created_at, bỏ qua rejected/failed/cancelled.';