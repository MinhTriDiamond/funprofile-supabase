-- =====================================================================
-- Giai đoạn 1: log-only cho logic giá USD mới của donations
-- =====================================================================

CREATE TABLE public.donation_price_validation_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  donation_id UUID,
  token_symbol TEXT NOT NULL,
  donation_date DATE,
  amount NUMERIC,
  code_amount_usd NUMERIC,
  code_price_usd NUMERIC,
  history_price_usd NUMERIC,
  diff_pct NUMERIC,
  verdict TEXT NOT NULL,            -- 'pending' | 'validation_failed' | 'ok_kept'
  phase TEXT NOT NULL DEFAULT 'log_only',  -- 'log_only' | 'enforce'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.donation_price_validation_log TO authenticated;
GRANT ALL ON public.donation_price_validation_log TO service_role;
ALTER TABLE public.donation_price_validation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view price validation log"
ON public.donation_price_validation_log
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_dpvl_created_at ON public.donation_price_validation_log (created_at DESC);
CREATE INDEX idx_dpvl_verdict ON public.donation_price_validation_log (verdict, created_at DESC);

-- Đếm số lần fetch giá thất bại theo (symbol, date) cho cron backfill
CREATE TABLE public.token_price_fetch_failures (
  symbol TEXT NOT NULL,
  date DATE NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  PRIMARY KEY (symbol, date)
);

GRANT SELECT ON public.token_price_fetch_failures TO authenticated;
GRANT ALL ON public.token_price_fetch_failures TO service_role;
ALTER TABLE public.token_price_fetch_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view token price fetch failures"
ON public.token_price_fetch_failures
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- Trigger: GIỮ NGUYÊN hành vi cũ, chỉ thêm ghi log "nếu enforce thì sao"
-- =====================================================================
CREATE OR REPLACE FUNCTION public.donations_set_usd_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_price NUMERIC;
  v_source TEXT;
  v_sym TEXT;
  v_date DATE;
  v_hist NUMERIC;
  v_code_price NUMERIC;
  v_diff_pct NUMERIC;
BEGIN
  IF NEW.token_symbol IS NULL THEN
    RETURN NEW;
  END IF;

  v_sym := upper(NEW.token_symbol);

  -- FUN testnet: luôn để rỗng
  IF v_sym = 'FUN' THEN
    NEW.amount_usd := NULL;
    NEW.price_usd_at_donation := NULL;
    NEW.price_source := 'testnet_skip';
    RETURN NEW;
  END IF;

  v_date := (COALESCE(NEW.created_at, now()))::date;

  SELECT price_usd INTO v_hist
  FROM public.token_price_history
  WHERE symbol = v_sym AND date = v_date
  LIMIT 1;

  -- Nhánh code truyền sẵn amount_usd: GIỮ NGUYÊN (log-only validate)
  IF NEW.amount_usd IS NOT NULL THEN
    IF v_hist IS NOT NULL AND NEW.amount::NUMERIC > 0 THEN
      v_code_price := NEW.amount_usd / NEW.amount::NUMERIC;
      v_diff_pct := abs(v_code_price - v_hist) / v_hist * 100;
      IF v_diff_pct > 2 THEN
        INSERT INTO public.donation_price_validation_log
          (donation_id, token_symbol, donation_date, amount, code_amount_usd,
           code_price_usd, history_price_usd, diff_pct, verdict, phase)
        VALUES (NEW.id, v_sym, v_date, NEW.amount::NUMERIC, NEW.amount_usd,
                v_code_price, v_hist, v_diff_pct, 'validation_failed', 'log_only');
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- 1) Giá lịch sử
  v_price := v_hist;

  IF v_price IS NOT NULL THEN
    v_source := 'historical';
  ELSE
    -- 2) TẠM giữ fallback reference (Giai đoạn 1), nhưng ghi log rằng
    --    logic mới sẽ cho ra pending.
    v_price := public.get_token_reference_usd(v_sym);
    v_source := CASE WHEN v_price IS NULL THEN NULL ELSE 'reference' END;

    INSERT INTO public.donation_price_validation_log
      (donation_id, token_symbol, donation_date, amount, code_amount_usd,
       code_price_usd, history_price_usd, diff_pct, verdict, phase)
    VALUES (NEW.id, v_sym, v_date, NEW.amount::NUMERIC,
            CASE WHEN v_price IS NULL THEN NULL ELSE NEW.amount::NUMERIC * v_price END,
            v_price, NULL, NULL, 'pending', 'log_only');
  END IF;

  NEW.price_usd_at_donation := v_price;
  NEW.amount_usd := CASE
    WHEN v_price IS NULL THEN NULL
    ELSE NEW.amount::NUMERIC * v_price
  END;
  NEW.price_source := v_source;

  RETURN NEW;
END;
$function$;