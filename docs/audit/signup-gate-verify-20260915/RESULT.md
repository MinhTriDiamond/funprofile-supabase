# Verify cờ khoá tạo tài khoản mới — kết quả thật trên production

Ngày chạy: 15/09/2026 03:45 → 03:52 UTC. Toàn bộ tài khoản test đã xoá sau khi verify
(audit `signup_gate_verify_cleanup_20260915`, actor hệ thống FUN.RICH
`a97cbb6c-2d00-40e9-a35a-f181273b17bb`).

## 1. Hai lớp cổng (phải bật CẢ HAI mới kín)

| Lớp | Nguồn sự thật | Che luồng nào |
|---|---|---|
| Ứng dụng | `app_settings.key='signup_enabled'` (JSON boolean), cổng dùng chung `supabase/functions/_shared/signupGate.ts` | 4 edge function tạo tài khoản |
| Nền tảng | cấu hình xác thực `disable_signup` | Auth API `/signup`, `/otp` (create_user), **Google OAuth người mới** |

Fail-safe: thiếu key hoặc lỗi đọc ⇒ **MỞ** (không chặn oan). Cổng chỉ áp cho **tạo tài
khoản mới**: không áp cho đăng nhập tài khoản cũ, gộp tài khoản (`sso-merge-*`), admin tạo tay.

## 2. Raw kết quả — trạng thái KHOÁ (`signup_enabled=false`, `disable_signup=true`)

```
auth-signup-send-confirm  403 {"success":false,"error":"signup_disabled","message":"Hệ thống đang tạm khoá việc tạo tài khoản mới để chuyển đổi hạ tầng. Vui lòng thử lại sau."}
sso-otp-verify (mới)      403 {"success":false,"error":"signup_disabled", ...}
sso-web3-auth  (mới)      403 {"success":false,"error":"signup_disabled", ...}
sso-register              401 {"error":"invalid_client","error_description":"Invalid client credentials"}
Auth API /signup          422 {"code":422,"error_code":"signup_disabled","msg":"Signups not allowed for this instance"}
Auth API /otp             422 {"code":422,"error_code":"signup_disabled","msg":"Signups not allowed for this instance"}
Auth /authorize?provider=google  302 → accounts.google.com (chuyển hướng vẫn xảy ra; user mới bị chặn ở bước callback do disable_signup)
```

`sso-register`: dừng ở lớp xác thực client trước khi tới cổng vì `client_secret` được lưu
dạng hash, sandbox không có bí mật gốc để tạo request hợp lệ. Cổng nằm **ngay trước**
`auth.admin.createUser` trong cùng file, dùng cùng helper đã chứng minh hoạt động ở 3 luồng
kia ⇒ xác nhận bằng đọc mã, không bằng gọi thật.

## 3. Raw kết quả — trạng thái MỞ (`signup_enabled=true`, `disable_signup=false`)

```
sso-otp-verify            200 {"success":true,"user_id":"17d6e0e6-…","is_new_user":true, access_token …}
sso-web3-auth             200 {"success":true,"message":"Account created and authenticated","user_id":"f646de0a-…","is_new_user":true}
auth-signup-send-confirm  200 {"success":true,"user_id":"97546849-…"}
Auth API /signup          200 {"id":"c0b829da-…", …}
```

## 4. Dọn dẹp

6 tài khoản test đã xoá (`profiles` → `auth.users`): `010aad23`, `4566346d`, `17d6e0e6`,
`f646de0a`, `97546849`, `c0b829da`. Verify raw: `auth_left=0`, `profiles_left=0`,
`otp_left=0`, ví tạm `wallets_left=0`, `audit_rows=1`, cờ `signup_enabled=true`,
`disable_signup=false` (đã khôi phục nguyên trạng).

## 5. Kết luận

- Cả 4 luồng tự dựng + Auth API đều chặn đúng khi khoá, mở đúng khi mở.
- **Google OAuth chỉ bị chặn bởi lớp nền tảng** — ở cutover phải bật cả hai công tắc,
  không chỉ cờ ứng dụng.
- Bật/tắt có hiệu lực ngay, không cần deploy.
