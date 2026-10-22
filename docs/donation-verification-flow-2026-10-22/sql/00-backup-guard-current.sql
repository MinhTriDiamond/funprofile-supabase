-- 00 — SAO LƯU HIỆN TRẠNG (chỉ để đối chiếu/khôi phục, KHÔNG chạy file này để thay đổi gì)
-- Định nghĩa hàm guard_client_financial_write đang sống trên production,
-- truy vấn trực tiếp từ pg_proc ngày 2026-10-22 (trước khi có bản v2 ở file 01).
-- Khôi phục khẩn cấp = chạy lại đúng CREATE OR REPLACE dưới đây.
-- Trigger đang gắn: trg_donations_client_guard (donations),
-- trg_transactions_client_guard (transactions) — cùng dùng hàm này.

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
