ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_amount_not_raw_wei_chk;

CREATE OR REPLACE FUNCTION public.guard_transactions_amount_scale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.amount IS NOT NULL AND NEW.amount ~ '^[0-9]{13,}$' THEN
    RAISE EXCEPTION 'transactions.amount looks like raw wei (%). Store human-readable units (see tx-scale-20260827).', NEW.amount
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_transactions_amount_scale() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_transactions_amount_scale ON public.transactions;
CREATE TRIGGER trg_guard_transactions_amount_scale
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_transactions_amount_scale();