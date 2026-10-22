-- Incident 2026-10-22 follow-up audit hardening: same owner-only policy pattern on other value tables
-- All guards apply ONLY to client roles (authenticated/anon). service_role and direct SQL unaffected.
-- Shape rules validated against full table contents: 0 conflicts.

-- 1) wallet_transfers: shape guard (client inserts own transfers after wallet sends)
CREATE OR REPLACE FUNCTION public.guard_client_wallet_transfers()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.token_symbol IS NULL OR NEW.token_symbol !~ '^[A-Za-z0-9._-]{1,25}$' THEN
    RAISE EXCEPTION 'invalid token_symbol' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.amount IS NOT NULL AND NEW.amount < 0 THEN
    RAISE EXCEPTION 'invalid amount' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'confirmed' AND COALESCE(NEW.amount, 0) = 0 THEN
    RAISE EXCEPTION 'confirmed rows require a positive amount' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tx_hash IS NOT NULL AND NEW.tx_hash !~ '^[A-Za-z0-9:._+/=-]*$' THEN
    RAISE EXCEPTION 'invalid tx_hash' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_wallet_transfers_client_guard ON public.wallet_transfers;
CREATE TRIGGER trg_wallet_transfers_client_guard
  BEFORE INSERT OR UPDATE ON public.wallet_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_wallet_transfers();

-- 2) swap_transactions: shape guard
CREATE OR REPLACE FUNCTION public.guard_client_swap_transactions()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.from_symbol IS NULL OR NEW.from_symbol !~ '^[A-Za-z0-9._-]{1,25}$'
     OR NEW.to_symbol IS NULL OR NEW.to_symbol !~ '^[A-Za-z0-9._-]{1,25}$' THEN
    RAISE EXCEPTION 'invalid swap symbol' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(NEW.from_amount, 0) < 0 OR COALESCE(NEW.to_amount, 0) < 0
     OR COALESCE(NEW.from_amount_usd, 0) < 0 OR COALESCE(NEW.to_amount_usd, 0) < 0 THEN
    RAISE EXCEPTION 'invalid swap amount' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tx_hash IS NOT NULL AND NEW.tx_hash !~ '^[A-Za-z0-9:._+/=-]*$' THEN
    RAISE EXCEPTION 'invalid tx_hash' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_swap_transactions_client_guard ON public.swap_transactions;
CREATE TRIGGER trg_swap_transactions_client_guard
  BEFORE INSERT OR UPDATE ON public.swap_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_swap_transactions();

-- 3) light_actions: client rows can only be born pending + unevaluated; scoring fields are evaluator-only
CREATE OR REPLACE FUNCTION public.guard_client_light_actions()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.mint_status := 'pending';
    NEW.is_eligible := false;
    NEW.angel_evaluation := NULL;
    NEW.mint_amount := NULL;
    NEW.minted_at := NULL;
    NEW.evaluated_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.light_score IS DISTINCT FROM OLD.light_score
     OR NEW.base_reward IS DISTINCT FROM OLD.base_reward
     OR NEW.quality_score IS DISTINCT FROM OLD.quality_score
     OR NEW.impact_score IS DISTINCT FROM OLD.impact_score
     OR NEW.integrity_score IS DISTINCT FROM OLD.integrity_score
     OR NEW.unity_score IS DISTINCT FROM OLD.unity_score
     OR NEW.mint_status IS DISTINCT FROM OLD.mint_status
     OR NEW.mint_amount IS DISTINCT FROM OLD.mint_amount
     OR NEW.mint_request_id IS DISTINCT FROM OLD.mint_request_id
     OR NEW.minted_at IS DISTINCT FROM OLD.minted_at
     OR NEW.is_eligible IS DISTINCT FROM OLD.is_eligible
     OR NEW.angel_evaluation IS DISTINCT FROM OLD.angel_evaluation
     OR NEW.evaluated_at IS DISTINCT FROM OLD.evaluated_at THEN
    RAISE EXCEPTION 'light action scoring fields are system-managed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_light_actions_client_guard ON public.light_actions;
CREATE TRIGGER trg_light_actions_client_guard
  BEFORE INSERT OR UPDATE ON public.light_actions
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_light_actions();

-- 4) light_reputation: computed rollup - clients cannot create rows or move computed values
CREATE OR REPLACE FUNCTION public.guard_client_light_reputation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'reputation rows are system-managed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.total_light_score IS DISTINCT FROM OLD.total_light_score
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.daily_mint_cap IS DISTINCT FROM OLD.daily_mint_cap
     OR NEW.total_minted IS DISTINCT FROM OLD.total_minted
     OR NEW.today_minted IS DISTINCT FROM OLD.today_minted
     OR NEW.today_date IS DISTINCT FROM OLD.today_date
     OR NEW.actions_count IS DISTINCT FROM OLD.actions_count
     OR NEW.avg_quality IS DISTINCT FROM OLD.avg_quality
     OR NEW.avg_impact IS DISTINCT FROM OLD.avg_impact
     OR NEW.avg_integrity IS DISTINCT FROM OLD.avg_integrity
     OR NEW.avg_unity IS DISTINCT FROM OLD.avg_unity
     OR NEW.pillar_service IS DISTINCT FROM OLD.pillar_service
     OR NEW.pillar_truth IS DISTINCT FROM OLD.pillar_truth
     OR NEW.pillar_healing IS DISTINCT FROM OLD.pillar_healing
     OR NEW.pillar_value IS DISTINCT FROM OLD.pillar_value
     OR NEW.pillar_unity IS DISTINCT FROM OLD.pillar_unity
     OR NEW.last_mint_at IS DISTINCT FROM OLD.last_mint_at
     OR NEW.consistency_streak IS DISTINCT FROM OLD.consistency_streak
     OR NEW.sequence_bonus IS DISTINCT FROM OLD.sequence_bonus THEN
    RAISE EXCEPTION 'reputation values are system-managed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_light_reputation_client_guard ON public.light_reputation;
CREATE TRIGGER trg_light_reputation_client_guard
  BEFORE INSERT OR UPDATE ON public.light_reputation
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_light_reputation();

-- 5) crypto_gifts: unused legacy table (0 rows) - close client writes entirely
CREATE OR REPLACE FUNCTION public.guard_client_crypto_gifts()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'crypto_gifts is closed for client writes' USING ERRCODE = 'check_violation';
END;
$function$;
DROP TRIGGER IF EXISTS trg_crypto_gifts_client_guard ON public.crypto_gifts;
CREATE TRIGGER trg_crypto_gifts_client_guard
  BEFORE INSERT OR UPDATE ON public.crypto_gifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_crypto_gifts();

SELECT tgname, tgrelid::regclass AS table_name FROM pg_trigger
WHERE tgname IN ('trg_wallet_transfers_client_guard', 'trg_swap_transactions_client_guard',
                 'trg_light_actions_client_guard', 'trg_light_reputation_client_guard',
                 'trg_crypto_gifts_client_guard') AND NOT tgisinternal
ORDER BY tgname;
