# Hộp thư - Lê Minh Trí (Coordinator)

Nơi ghi các vòng việc do bé Trí phụ trách trên FUN Profile, theo quy trình làm việc của đội Coordinator.

## #1 - 2026-10-23 - Bật CAPTCHA (Cloudflare Turnstile) cho cổng đăng ký và đăng nhập
- Người làm: bé Trí cùng Angel Muse. Nhánh: feat/tri-signup-captcha.
- Lý do: sau sự cố tài khoản giả mạo ngày 22/10 (chiến dịch email dùng một lần tạo 15 tài khoản), cuộc audit toàn app ngày 23/10 xác nhận cổng đăng ký/đăng nhập chưa có CAPTCHA - bot tạo tài khoản và gửi email hàng loạt không gặp trở ngại nào ngoài rate limit theo từng email (vô hiệu khi kẻ xấu xoay vòng nhiều email).
- Phạm vi: (1) widget Turnstile vào form OTP (EmailOtpLogin) và form email - mật khẩu (ClassicEmailLogin), site key công khai qua biến VITE_TURNSTILE_SITE_KEY; (2) ba edge functions cổng xác thực (sso-otp-request, auth-signup-send-confirm, password-reset-request) xác thực token phía server qua helper chung _shared/turnstile.ts - chỉ ép buộc khi secret TURNSTILE_SECRET_KEY đã được đặt; (3) sau cùng mới bật CAPTCHA trong cấu hình Supabase Auth cho cổng đăng nhập bằng mật khẩu.
- Thứ tự an toàn: frontend và code server lên trước ở chế độ chưa ép buộc, kiểm thử preview, rồi mới đặt secret và bật công tắc - không thành viên nào bị khóa đăng nhập trong quá trình làm.
- Trạng thái: đang thực hiện (thông báo Telegram Bước 1 đã gửi ngày 23/10/2026).
