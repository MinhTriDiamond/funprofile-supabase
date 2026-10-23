-- ============================================================================
-- CHỐT CHẶN ĐĂNG KÝ — thiết bị / ví / email bị gắn cờ không đăng ký lại được
-- Ngày: 2026-10-23 · Nhánh: feat/van-signup-device-guard
-- Thiết kế đầy đủ: docs/signup-device-guard-2026-10-23/THIET-KE.md
--
-- Nội dung:
--   1) public.signup_blocklist  — danh sách chặn hợp nhất (email | wallet | device)
--   2) public.signup_block_log  — ghi lại MỌI lần đăng ký bị chặn (admin xem lại)
--   3) public.check_signup_block(email, device_hash, wallet) — hàm kiểm tra
--      dùng bởi các edge function tạo tài khoản (sso-otp-verify, sso-web3-auth)
--      qua module dùng chung supabase/functions/_shared/signupBlockGuard.ts
--   4) Dữ liệu hạt giống từ sự cố 22–23/10/2026 + bổ sung 2 ví vào bảng
--      blacklisted_wallets sẵn có (sso-web3-auth đã kiểm tra bảng đó).
--
-- Nguyên tắc an toàn:
--   - Chốt CHỈ áp cho việc TẠO TÀI KHOẢN MỚI. Tài khoản hiện hữu đăng nhập
--     lại không qua hàm này — không khoá oan người thật đang dùng chung thiết bị.
--   - Gỡ chặn 1 mục: UPDATE public.signup_blocklist SET is_active=false
--     WHERE block_type=... AND value=...; (xem thêm mục Khôi phục trong thiết kế)
-- ============================================================================

-- 1) Danh sách chặn hợp nhất -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signup_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_type text NOT NULL CHECK (block_type IN ('email', 'wallet', 'device')),
  value text NOT NULL, -- đã chuẩn hoá: chữ thường, bỏ khoảng trắng hai đầu; ví dạng 0x thường
  reason text,
  source text NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (block_type, value)
);

CREATE INDEX IF NOT EXISTS idx_signup_blocklist_lookup
  ON public.signup_blocklist (block_type, value) WHERE is_active;

-- 2) Log các lần bị chặn ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signup_block_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_email text,
  device_hash text,
  wallet_address text,
  block_type text,
  matched_value text,
  rule text, -- blocklist | device_flagged_many_accounts | device_flagged_rapid_registration
  source text, -- sso-otp-verify | sso-web3-auth
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_block_log_created
  ON public.signup_block_log (created_at DESC);

-- 3) RLS: chỉ admin xem/quản lý qua giao diện; edge function dùng service_role
ALTER TABLE public.signup_blocklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_block_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage signup blocklist" ON public.signup_blocklist;
CREATE POLICY "Admins manage signup blocklist" ON public.signup_blocklist
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view signup block log" ON public.signup_block_log;
CREATE POLICY "Admins view signup block log" ON public.signup_block_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.signup_blocklist, public.signup_block_log FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_blocklist TO authenticated;
GRANT SELECT ON public.signup_block_log TO authenticated;

-- 4) Hàm kiểm tra -------------------------------------------------------------
-- Trả về jsonb: {"blocked": false}
--   hoặc {"blocked": true, "block_type": ..., "matched_value": ..., "rule": ...}
-- Thứ tự: (a) danh sách chặn cứng: email → ví → thiết bị;
--         (b) thiết bị đã is_flagged=true và vượt ngưỡng:
--             - tổng số tài khoản từng gắn với thiết bị >= 10, hoặc
--             - >= 3 tài khoản được tạo trong 24 giờ gần nhất trên thiết bị.
CREATE OR REPLACE FUNCTION public.check_signup_block(p_email text, p_device_hash text, p_wallet text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_device text := nullif(lower(btrim(coalesce(p_device_hash, ''))), '');
  v_wallet text := nullif(lower(btrim(coalesce(p_wallet, ''))), '');
  v_hit text;
  v_flagged boolean;
  v_total int;
  v_recent int;
BEGIN
  -- (a) Danh sách chặn cứng
  IF v_email IS NOT NULL THEN
    SELECT value INTO v_hit FROM public.signup_blocklist
     WHERE block_type = 'email' AND value = v_email AND is_active
       AND (expires_at IS NULL OR expires_at > now())
     LIMIT 1;
    IF v_hit IS NOT NULL THEN
      RETURN jsonb_build_object('blocked', true, 'block_type', 'email',
                               'matched_value', v_email, 'rule', 'blocklist');
    END IF;
  END IF;

  IF v_wallet IS NOT NULL THEN
    SELECT value INTO v_hit FROM public.signup_blocklist
     WHERE block_type = 'wallet' AND value = v_wallet AND is_active
       AND (expires_at IS NULL OR expires_at > now())
     LIMIT 1;
    IF v_hit IS NOT NULL THEN
      RETURN jsonb_build_object('blocked', true, 'block_type', 'wallet',
                               'matched_value', v_wallet, 'rule', 'blocklist');
    END IF;
  END IF;

  IF v_device IS NOT NULL THEN
    SELECT value INTO v_hit FROM public.signup_blocklist
     WHERE block_type = 'device' AND value = v_device AND is_active
       AND (expires_at IS NULL OR expires_at > now())
     LIMIT 1;
    IF v_hit IS NOT NULL THEN
      RETURN jsonb_build_object('blocked', true, 'block_type', 'device',
                               'matched_value', v_device, 'rule', 'blocklist');
    END IF;

    -- (b) Thiết bị đã bị gắn cờ trong pplp_device_registry và vượt ngưỡng
    SELECT bool_or(is_flagged) INTO v_flagged
      FROM public.pplp_device_registry WHERE device_hash = v_device;

    IF coalesce(v_flagged, false) THEN
      SELECT count(DISTINCT user_id) INTO v_total
        FROM public.pplp_device_registry WHERE device_hash = v_device;
      IF v_total >= 10 THEN
        RETURN jsonb_build_object('blocked', true, 'block_type', 'device',
                                 'matched_value', v_device,
                                 'rule', 'device_flagged_many_accounts');
      END IF;

      SELECT count(*) INTO v_recent
        FROM public.profiles pr
        JOIN public.pplp_device_registry dr ON dr.user_id = pr.id
       WHERE dr.device_hash = v_device
         AND pr.created_at > now() - interval '24 hours';
      IF v_recent >= 3 THEN
        RETURN jsonb_build_object('blocked', true, 'block_type', 'device',
                                 'matched_value', v_device,
                                 'rule', 'device_flagged_rapid_registration');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('blocked', false);
END $$;

REVOKE ALL ON FUNCTION public.check_signup_block(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_signup_block(text, text, text) TO service_role;

-- 5) Dữ liệu hạt giống — sự cố tài khoản giả 22–23/10/2026 --------------------
INSERT INTO public.signup_blocklist (block_type, value, reason, source) VALUES
  ('device', '0a7fa1f0ccfb86d586775f054a9499a8',
   'Thiết bị sinh 3 tài khoản giả ngày 22/10/2026; sau khi bị xoá lại đăng ký tiếp 2 tài khoản ngày 23/10/2026 (registry ghi nhận: cùng thiết bị với 32 tài khoản)',
   'incident-2026-10-22-23'),
  ('wallet', '0x57741ff9dc2fa47e4a391567712a1cebb3ff587c',
   'Ví của tài khoản giả @angelleminhquan (đã xoá); bị tái sử dụng bởi @lovehubbinhminh ngày 23/10/2026',
   'incident-2026-10-22-23'),
  ('wallet', '0xa7932b974d00eb571de1414a4a8b06cc07662c6a',
   'Ví của tài khoản giả @angelleminhtri (đã xoá); bị tái sử dụng khi đăng ký lại ngày 23/10/2026',
   'incident-2026-10-22-23'),
  ('email', 'fatherunier@gmail.com',
   'Email tài khoản giả @lovehubbinhminh (đã xoá vĩnh viễn 23/10/2026)',
   'incident-2026-10-22-23'),
  ('email', 'unierfather@gmail.com',
   'Email tài khoản giả @angelleminhtri (đã xoá vĩnh viễn 23/10/2026)',
   'incident-2026-10-22-23'),
  ('email', 'kimnana20091991@gmail.com',
   'Email tài khoản giả @angelleminhquan (đã xoá)',
   'incident-2026-10-22-23'),
  ('email', 'caothaisongiang@gmail.com',
   'Email tài khoản giả @angelngocgiau (đã xoá)',
   'incident-2026-10-22-23')
ON CONFLICT (block_type, value) DO NOTHING;

-- Bổ sung 2 ví vào danh sách đen ví sẵn có: sso-web3-auth kiểm tra bảng này ở
-- MỌI lần đăng nhập/đăng ký bằng ví, nên 2 ví này bị chặn ngay cả trước khi
-- chốt hợp nhất phía trên được gọi.
INSERT INTO public.blacklisted_wallets (wallet_address, reason, is_permanent)
SELECT v.wallet_address, v.reason, true
FROM (VALUES
  ('0x57741ff9dc2fa47e4a391567712a1cebb3ff587c',
   'Ví tài khoản giả, bị tái sử dụng sau khi tài khoản bị xoá (sự cố 22–23/10/2026)'),
  ('0xa7932b974d00eb571de1414a4a8b06cc07662c6a',
   'Ví tài khoản giả, bị tái sử dụng sau khi tài khoản bị xoá (sự cố 22–23/10/2026)')
) AS v(wallet_address, reason)
WHERE NOT EXISTS (
  SELECT 1 FROM public.blacklisted_wallets b WHERE lower(b.wallet_address) = v.wallet_address
);
