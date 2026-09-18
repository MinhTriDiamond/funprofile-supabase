-- ═══ record-swap USD validation · GIAI ĐOẠN 1 (LOG-ONLY) ═══
-- Ghi song song so sánh USD client khai vs giá thật token_price_history.
-- KHÔNG thay đổi from_amount_usd / to_amount_usd đang lưu.

CREATE TABLE IF NOT EXISTS public.swap_price_validation_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_id       uuid,
  tx_hash       text,
  chain_id      integer,
  side          text NOT NULL CHECK (side IN ('from','to')),
  token_symbol  text NOT NULL,
  swap_date     date NOT NULL,
  amount        numeric,
  code_amount_usd   numeric,
  code_price_usd    numeric,
  history_price_usd numeric,
  diff_pct      numeric,
  verdict       text NOT NULL,
  phase         text NOT NULL DEFAULT 'log_only',
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.swap_price_validation_log TO service_role;
GRANT SELECT ON public.swap_price_validation_log TO authenticated;

ALTER TABLE public.swap_price_validation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read swap price validation log" ON public.swap_price_validation_log;
CREATE POLICY "Admins read swap price validation log"
  ON public.swap_price_validation_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_swap_price_log_created ON public.swap_price_validation_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swap_price_log_verdict ON public.swap_price_validation_log (verdict);

-- ─── Trigger log-only ───
CREATE OR REPLACE FUNCTION public.swap_price_validation_logonly()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date        date := (COALESCE(NEW.created_at, now()))::date;
  v_side        text;
  v_symbol      text;
  v_amount      numeric;
  v_code_usd    numeric;
  v_code_price  numeric;
  v_hist        numeric;
  v_diff        numeric;
  v_verdict     text;
BEGIN
  FOREACH v_side IN ARRAY ARRAY['from','to'] LOOP
    IF v_side = 'from' THEN
      v_symbol := upper(COALESCE(NEW.from_symbol, ''));
      v_amount := NEW.from_amount;
      v_code_usd := NEW.from_amount_usd;
    ELSE
      v_symbol := upper(COALESCE(NEW.to_symbol, ''));
      v_amount := NEW.to_amount;
      v_code_usd := NEW.to_amount_usd;
    END IF;

    IF v_symbol = '' OR v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    -- FUN là token testnet, không có giá thị trường → bỏ qua
    IF v_symbol = 'FUN' THEN
      v_verdict := 'testnet_skip';
      v_hist := NULL;
      v_code_price := NULL;
      v_diff := NULL;
    ELSE
      SELECT price_usd INTO v_hist
      FROM public.token_price_history
      WHERE symbol = v_symbol AND date = v_date
      LIMIT 1;

      v_code_price := CASE WHEN v_code_usd IS NOT NULL AND v_amount > 0 THEN v_code_usd / v_amount END;

      IF v_code_usd IS NULL THEN
        v_verdict := CASE WHEN v_hist IS NULL THEN 'no_code_no_history' ELSE 'no_code_price' END;
        v_diff := NULL;
      ELSIF v_hist IS NULL OR v_hist <= 0 THEN
        v_verdict := 'no_history';
        v_diff := NULL;
      ELSE
        v_diff := abs(v_code_price - v_hist) / v_hist * 100;
        v_verdict := CASE WHEN v_diff > 2 THEN 'would_fail' ELSE 'ok' END;
      END IF;
    END IF;

    INSERT INTO public.swap_price_validation_log (
      swap_id, tx_hash, chain_id, side, token_symbol, swap_date, amount,
      code_amount_usd, code_price_usd, history_price_usd, diff_pct, verdict, phase
    ) VALUES (
      NEW.id, NEW.tx_hash, NEW.chain_id, v_side, v_symbol, v_date, v_amount,
      v_code_usd, v_code_price, v_hist, v_diff, v_verdict, 'log_only'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.swap_price_validation_logonly() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_swap_price_validation_logonly ON public.swap_transactions;
CREATE TRIGGER trg_swap_price_validation_logonly
  AFTER INSERT ON public.swap_transactions
  FOR EACH ROW EXECUTE FUNCTION public.swap_price_validation_logonly();