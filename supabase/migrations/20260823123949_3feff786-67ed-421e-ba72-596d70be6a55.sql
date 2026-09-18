-- BTC_WALLET_AUDIT_WRITE_LOCK (P0, pre-Phase-1)
-- btc-wallet-audit vẫn còn nhánh ghi sống bằng heuristic tự học (hd_change_auto, hd_cluster)
-- và backfill donations/wallet_transfers/posts ngay trong cùng 1 request, KHÔNG lọc qua
-- profile_btc_aux_addresses.verified — cùng bản chất suy luận vòng tròn với hd_input_back (RC8/RC-10)
-- dù nhãn source khác. Khoá toàn bộ ghi (persist aux + backfill) cho tới khi resolver Phase 1
-- (btc_address_ownership_history + xác thực chữ ký BIP-322) thay thế. Đọc/BFS/report vẫn chạy bình
-- thường để admin tiếp tục điều tra — chỉ chặn INSERT/UPDATE/DELETE.
-- Bật lại: app_settings.btc_wallet_audit_write_enabled = 'true' (không khuyến nghị trước Phase 3).
INSERT INTO public.app_settings (key, value)
VALUES ('btc_wallet_audit_write_enabled', 'false')
ON CONFLICT (key) DO UPDATE SET value = 'false';

CREATE OR REPLACE FUNCTION public.btc_wallet_audit_write_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT lower(value) = 'true' FROM public.app_settings WHERE key = 'btc_wallet_audit_write_enabled'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.btc_wallet_audit_write_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btc_wallet_audit_write_enabled() TO authenticated, anon, service_role;
