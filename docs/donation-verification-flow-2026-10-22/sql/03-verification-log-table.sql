-- 03 — Bảng log quyết định của bộ xác thực donation_verification_log
-- Dự án: docs/donation-verification-flow-2026-10-22/ — thiết kế THIET-KE.md Mục 4.
-- Nơi thay đổi: PRODUCTION DATABASE — file này CHƯA được chạy. Chạy TRƯỚC file 01 và trước khi deploy
-- edge function verify-pending-donations (hàm ghi log vào bảng này ở cả hai chế độ shadow/enforce).
-- An toàn: bảng mới hoàn toàn, không đụng dữ liệu cũ. RLS bật, không cấp quyền qua API —
-- chỉ service_role (bộ xác thực) ghi/đọc, đúng mẫu các bảng bằng chứng sự cố 2026-10-22.
-- Khôi phục: DROP TABLE public.donation_verification_log; (chỉ khi cần gỡ toàn bộ dự án và đã sao lưu log)

CREATE TABLE IF NOT EXISTS public.donation_verification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id uuid NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('shadow', 'enforce')),
  verdict text NOT NULL CHECK (verdict IN ('match', 'match_partial', 'mismatch', 'not_found', 'error')),
  reason text,
  evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donation_verification_log_donation
  ON public.donation_verification_log (donation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_donation_verification_log_created
  ON public.donation_verification_log (created_at DESC);

ALTER TABLE public.donation_verification_log ENABLE ROW LEVEL SECURITY;
-- Không tạo policy nào: anon/authenticated không đọc/ghi được qua API; service_role bỏ qua RLS.
