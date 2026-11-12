-- ============================================================================
-- BỔ SUNG DANH SÁCH CHẶN — 2 tài khoản giả tái đăng ký ngày 25–26/10/2026
-- Nhánh: feat/van-signup-device-guard · PR #29 (bổ sung, không thay migration gốc)
-- Chạy SAU migration 20261023130000_signup_device_guard.sql.
--
-- Kết quả truy vết chỉ đọc ngày 27/10/2026 (cả 2 tài khoản đã bị xoá vĩnh viễn
-- trước khi truy vết, nên không còn trong public.profiles):
--   * @angelthuytram — email fatherunier@gmail.com, ví
--     0xa7932b974d00eb571de1414a4a8b06cc07662c6a, ví được gán lúc
--     2026-10-25 15:58 UTC, thiết bị 0a7fa1f0ccfb86d586775f054a9499a8.
--     Ví + email này ĐÃ có trong migration gốc 23/10 — không cần chèn lại.
--   * @angelngocgiau (tái đăng ký) — email unierfather@gmail.com, ví MỚI
--     0x950a2a90d13d4b0fa2cd57ad5c73e5f3da71ed6b, ví được gán lúc
--     2026-10-25 16:08 UTC (= 00:08 KL 26/10), cùng thiết bị bị gắn cờ trên.
--     Chỉ ví mới này là chưa có trong danh sách chặn — file này chèn nó.
--   * Thiết bị 0a7fa1f0ccfb86d586775f054a9499a8 hiện ghi nhận 34 tài khoản
--     (tăng từ 32 tài khoản ngày 23/10), vẫn is_flagged=true.
--
-- Lưu ý: KHÔNG chặn theo tên người dùng. Tên @angelthuytram còn gắn với một
-- tài khoản khác từ tháng 4/2026 (email/ví khác hẳn), nên chốt chỉ chặn theo
-- thiết bị / ví / email — đúng như thiết kế gốc, chỉ áp cho TẠO TÀI KHOẢN MỚI.
-- ============================================================================

INSERT INTO public.signup_blocklist (block_type, value, reason, source) VALUES
  ('wallet', '0x950a2a90d13d4b0fa2cd57ad5c73e5f3da71ed6b',
   'Ví mới của tài khoản giả @angelngocgiau tái đăng ký 26/10/2026 (email unierfather@gmail.com), cùng thiết bị bị gắn cờ 0a7fa1f0ccfb86d586775f054a9499a8',
   'incident-2026-10-25-26')
ON CONFLICT (block_type, value) DO NOTHING;

-- Bổ sung ví mới vào danh sách đen ví sẵn có (sso-web3-auth kiểm tra bảng này
-- ở mọi lần đăng nhập/đăng ký bằng ví).
INSERT INTO public.blacklisted_wallets (wallet_address, reason, is_permanent)
SELECT v.wallet_address, v.reason, true
FROM (VALUES
  ('0x950a2a90d13d4b0fa2cd57ad5c73e5f3da71ed6b',
   'Ví tài khoản giả tái đăng ký 26/10/2026, cùng thiết bị bị gắn cờ (sự cố 25–26/10/2026)')
) AS v(wallet_address, reason)
WHERE NOT EXISTS (
  SELECT 1 FROM public.blacklisted_wallets b WHERE lower(b.wallet_address) = v.wallet_address
);
