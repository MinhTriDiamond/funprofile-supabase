-- Incident 2026-10-22 hardening: client-write shape guard for donations + transactions
-- Applies ONLY when the writer is a client role (authenticated/anon via PostgREST).
-- service_role (scanners, edge functions) and direct SQL (postgres) are NOT affected.
-- Rules were validated against 30 days of real traffic: 0 false positives on 1,208 donations + 2,292 transactions.
CREATE OR REPLACE FUNCTION public.guard_client_financial_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.token_symbol IS NULL OR NEW.token_symbol !~ '^[A-Za-z0-9._-]{1,25}$' THEN
    RAISE EXCEPTION 'invalid token_symbol' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.amount IS NULL OR NEW.amount !~ '^[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'invalid amount' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'confirmed' AND NEW.amount::numeric = 0 THEN
    RAISE EXCEPTION 'confirmed rows require a positive amount' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tx_hash IS NOT NULL AND NEW.tx_hash !~ '^[A-Za-z0-9:._+/=-]*$' THEN
    RAISE EXCEPTION 'invalid tx_hash' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_TABLE_NAME = 'donations' THEN
    IF NEW.amount_usd IS NOT NULL AND NEW.amount_usd < 0 THEN
      RAISE EXCEPTION 'invalid amount_usd' USING ERRCODE = 'check_violation';
    END IF;
    -- Temporary client guardrail until server-side verification lands:
    -- largest real confirmed gift in 90 days is about $22k; the registry cap for USDT is $1M.
    IF NEW.status = 'confirmed' AND COALESCE(NEW.amount_usd, 0) > 100000 THEN
      RAISE EXCEPTION 'confirmed amount_usd above client guardrail' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.amount_normalized IS NOT NULL AND NEW.amount_normalized < 0 THEN
      RAISE EXCEPTION 'invalid amount_normalized' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_donations_client_guard ON public.donations;
CREATE TRIGGER trg_donations_client_guard
  BEFORE INSERT OR UPDATE ON public.donations
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_financial_write();
DROP TRIGGER IF EXISTS trg_transactions_client_guard ON public.transactions;
CREATE TRIGGER trg_transactions_client_guard
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_financial_write();
-- Grant hygiene: no client role ever needs TRUNCATE on financial tables
REVOKE TRUNCATE ON public.donations FROM authenticated, anon;
REVOKE TRUNCATE ON public.transactions FROM authenticated, anon;
SELECT tgname, tgrelid::regclass AS table_name FROM pg_trigger
WHERE tgname IN ('trg_donations_client_guard', 'trg_transactions_client_guard') AND NOT tgisinternal
ORDER BY tgname;
