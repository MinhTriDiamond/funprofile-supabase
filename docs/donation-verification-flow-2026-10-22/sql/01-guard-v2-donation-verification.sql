-- 01 — GUARD V2: luồng xác thực giao dịch tặng quà (donations)
-- Dự án: docs/donation-verification-flow-2026-10-22/ — thiết kế THIET-KE.md Mục 3 (Phần 1) + Mục 8 (quyết định đã chốt)
-- Nơi thay đổi: PRODUCTION DATABASE (Supabase tljfqavndndfsvtazibe) — file này CHƯA được chạy.
-- Người chạy: Angel Muse của bé Trí (quyết định 5, hộp thư ai-van.md Mục 4), sau khi file 03 đã tạo bảng log
--            và bộ test ở file 02 đạt trong giao dịch rollback.
-- Sao lưu trước khi chạy: file 00 trong thư mục này (định nghĩa hàm hiện tại). Khôi phục = chạy lại file 00.
--
-- Thay đổi so với bản đang sống (chỉ thêm nhánh donations, giữ nguyên mọi luật cũ):
--  [INSERT phía client] status 'confirmed' do client đặt -> ép về 'pending_verification' (+ đóng dấu thời gian chờ);
--                       amount_usd / price_usd_at_donation / price_source / confirmed_at do client khai -> gạt về NULL
--                       (trigger trg_donations_set_usd_default của DB vẫn được tính giá trị riêng của nó nếu có —
--                        phần client khai không bao giờ được giữ);
--                       tx_hash của dòng EVM phải đúng định dạng 0x + 64 hex, sai là chặn (backtest 30 ngày: 0 dòng thật vi phạm).
--  [UPDATE phía client] đóng băng các trường kết luận (status, amount_usd, price, confirmed_at, integrity_*)
--                       theo giá trị cũ — client không tự sửa kết luận được. Các trường nội dung (message, card...) vẫn sửa bình thường.
--  Không đổi: vai trò service_role / SQL trực tiếp không bị guard (bộ xác thực phía server ghi tự do);
--             dòng 'failed' do client ghi (luồng ví báo thất bại, 51 dòng lịch sử) không bị đụng;
--             nhóm BTC manual (chain_family = 'btc') không bị ép định dạng hash EVM.

CREATE OR REPLACE FUNCTION public.guard_client_financial_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- === Donation verification flow (2026-10-22): client chỉ được KHAI BÁO món quà,
  -- === kết luận (confirmed / amount_usd / integrity) chỉ do server xác thực ghi.
  IF TG_TABLE_NAME = 'donations' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status = 'confirmed' THEN
        NEW.status := 'pending_verification';
      END IF;
      IF NEW.status = 'pending_verification' AND NEW.pending_verification_since IS NULL THEN
        NEW.pending_verification_since := now();
      END IF;
      NEW.amount_usd := NULL;
      NEW.price_usd_at_donation := NULL;
      NEW.price_source := NULL;
      NEW.confirmed_at := NULL;
      IF NEW.chain_family = 'evm' AND (NEW.tx_hash IS NULL OR NEW.tx_hash !~ '^0x[0-9a-fA-F]{64}$') THEN
        RAISE EXCEPTION 'invalid tx_hash format' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.status := OLD.status;
      NEW.amount_usd := OLD.amount_usd;
      NEW.price_usd_at_donation := OLD.price_usd_at_donation;
      NEW.price_source := OLD.price_source;
      NEW.confirmed_at := OLD.confirmed_at;
      NEW.integrity_status := OLD.integrity_status;
      NEW.integrity_reason := OLD.integrity_reason;
      NEW.integrity_flagged_at := OLD.integrity_flagged_at;
    END IF;
  END IF;
  -- === Hết nhánh mới ===

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
