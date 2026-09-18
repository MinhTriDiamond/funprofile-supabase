-- Khoá tạm việc user tự đổi profiles.btc_address (giữ nguyên dữ liệu, dễ mở lại)
INSERT INTO public.app_settings (key, value)
VALUES ('btc_address_updates_enabled', 'false')
ON CONFLICT (key) DO UPDATE SET value = 'false';

CREATE OR REPLACE FUNCTION public.enforce_btc_address_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_enabled boolean;
  v_uid uuid;
BEGIN
  IF NEW.btc_address IS NOT DISTINCT FROM OLD.btc_address THEN
    RETURN NEW;
  END IF;

  SELECT (value)::text::boolean INTO v_enabled
  FROM public.app_settings WHERE key = 'btc_address_updates_enabled';

  IF v_enabled IS NULL OR v_enabled = true THEN
    RETURN NEW;
  END IF;

  v_uid := auth.uid();

  -- Miễn trừ: admin (đường xử lý thủ công) và tiến trình hệ thống (service_role/postgres)
  IF v_uid IS NOT NULL AND public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF v_uid IS NULL AND current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'BTC_ADDRESS_LOCKED: Tính năng đổi địa chỉ BTC đang tạm khoá để bảo trì/bảo vệ tài sản. Vui lòng liên hệ admin nếu cần đổi ví khẩn cấp.'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_btc_address_lock ON public.profiles;
CREATE TRIGGER trg_btc_address_lock
BEFORE UPDATE OF btc_address ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_btc_address_lock();