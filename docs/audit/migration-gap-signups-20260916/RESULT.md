# Tracking tài khoản đăng ký mới trong gap migrate — kết quả thật

Ngày chạy: 16/09/2026 11:31 → 11:35 UTC. Signup KHÔNG bị khoá (`signup_enabled=true`,
`disable_signup=false` — không thay đổi).

## 1. export_cutoff_time đã dùng

`app_settings.key='export_cutoff_time'` = **`2026-09-16T00:00:00Z`**.

Lý do: thời điểm bắt đầu export do Lovable Cloud chạy **không hiện trong DB**. Bé đã soi
`pg_stat_activity` (toàn bộ backend + backend_start trong 6 giờ) — không có tiến trình
`pg_dump`/export nào, chỉ có PostgREST/Storage/realtime/pg_cron. Export baseline chạy ở
tầng hạ tầng ngoài database nên không để lại dấu truy vấn được.

Vì vậy bé chọn mốc **rộng hơn thực tế** (00:00 UTC ngày 16/09) để bảo đảm **không bỏ sót**:
mọi tài khoản tạo hôm nay đều được track, kể cả tài khoản có thể đã nằm trong file export.
Đây là superset an toàn; khi Cha có giờ:phút:giây chính xác từ Lovable, chỉ cần cập nhật
1 dòng cấu hình `export_cutoff_time` là mốc siết lại ngay, không cần deploy.

## 2. Bảng tracking

`public.migration_gap_signups` — cột: `user_id` (unique), `email`, `signup_method`
(`password` / `otp` / `oauth_google` / `wallet`), `wallet_address`, `username`,
`created_at`, `logged_at`. Index theo `created_at DESC`.

Quyền: `GRANT ALL` cho `service_role`, `REVOKE ALL` với `anon` + `authenticated`;
RLS bật, 1 policy duy nhất `TO service_role`. Không public, không authenticated.

## 3. Trigger

KHÔNG tạo trigger mới trên `auth.users`. Bé thêm **1 nhánh ghi log** vào cuối function
`public.handle_new_user()` (trigger `on_auth_user_created` đã tồn tại từ trước), sau khi
đã tạo profile + user_role — logic tạo user không sửa 1 dòng nào. Nhánh log bọc
`EXCEPTION WHEN OTHERS THEN NULL` nên nếu ghi log lỗi thì signup vẫn thành công.

## 4. Verify raw

Lỗi phát hiện ở lần thử 1: `app_settings.value` là **TEXT** (không phải jsonb), giá trị
lưu kèm dấu ngoặc kép ⇒ cast timestamptz thất bại, nhánh log im lặng bỏ qua.
Đã sửa: chuẩn hoá giá trị về `2026-09-16T00:00:00Z` và đọc bằng `btrim(value,'"')::timestamptz`.

```
# Lần 1 (trước fix) — tạo user c01bc6b5-52cf-4ab9-98d5-955a8f265213
migration_gap_signups: []          ← không ghi (bug cast)

# Lần 2 (sau fix) — tạo user adbad789-112c-47ab-bdd7-4d48960ed3a6
migration_gap_signups:
  user_id       adbad789-112c-47ab-bdd7-4d48960ed3a6
  email         gaptrack2026091602@fun.rich.test
  signup_method password
  wallet_address NULL
  username      gaptrack2026091602
  created_at    2026-09-16 11:33:30.799175+00
  logged_at     2026-09-16 11:33:30.798864+00
```

## 5. Dọn dẹp + ghi bù

2 tài khoản test đã xoá (`migration_gap_signups` → `profiles` → `auth.users`):
`auth_left=0`, `profiles_left=0`. Audit: `migration_gap_tracking_verify` /
`migration_gap_signups_verify_cleanup_20260916`, actor hệ thống FUN.RICH
`a97cbb6c-2d00-40e9-a35a-f181273b17bb`.

Ghi bù tài khoản thật đã tạo sau mốc cutoff — hiện có đúng **1 dòng**:

```
ac0539fe-e97f-4645-8544-33564a920155  caol60248@gmail.com  password  angelthanhnghia  2026-09-16 05:57:07+00
```

## 6. Ghi chú

Nhánh log chỉ chạy trong `handle_new_user` ⇒ bao mọi luồng đi qua Auth
(password, OTP, Google OAuth, wallet, admin tạo tay). Không ảnh hưởng nghiệp vụ nào khác.
