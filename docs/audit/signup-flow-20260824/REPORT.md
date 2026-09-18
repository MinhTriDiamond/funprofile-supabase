# AUDIT KHẨN (P0) — Luồng đăng ký tài khoản mới (24/08/2026)

Chỉ đọc. Không sửa code, không tạo/xoá dữ liệu.

## KẾT LUẬN GỐC (quan trọng nhất)

Tài khoản test **KHÔNG TỒN TẠI** trong `auth.users`, cũng không có trong `profiles`.
UID Cha cung cấp (`76e7410b-e0af-4f96-bfc4-2803ef56157`) chỉ có 35 ký tự → không phải UUID hợp lệ.

```sql
select id,email,created_at from auth.users
where email='leminhtri.camlycoin@gmail.com' or id::text like '76e7410b%';
-- []  (0 dòng)
```

Nhưng OTP thì ĐÃ GỬI và ĐÃ TIÊU:

```sql
select identifier,type,is_used,attempts,created_at from otp_codes
where identifier ilike 'le%' order by created_at desc limit 4;
leminhtri.camlycoin@gmail.com | email | is_used=true | attempts=0 | 09:46:16Z
leminhtri.camlycoin@gmail.com | email | is_used=true | attempts=0 | 09:44:21Z
leminhtri.camlycoin@gmail.com | email | is_used=true | attempts=0 | 09:42:11Z
letanchuong0202@gmail.com     | email | is_used=false| attempts=0 | 07:18:00Z
```

`email_delivery_logs`: 3 dòng `sso_otp` status=**sent**, error_message=NULL, 09:42:12 / 09:44:22 / 09:46:16 + 1 dòng `password_reset` sent 09:52:51 (đều cho `le***n@gmail.com`).

→ **Email KHÔNG lỗi. Resend gửi thành công 3/3, không chạm quota, không có error_message.**
→ Mã OTP nhập ĐÚNG (attempts=0, is_used=true nghĩa là verify đã match code và mark used).
→ Nhưng bước **tạo user sau khi verify OTP thất bại** ⇒ không có `auth.users` ⇒ không có `profiles`
(vì profiles chỉ sinh bởi trigger `on_auth_user_created` trên `auth.users`) ⇒ mọi thứ sau đó "treo":
không profile, không đăng bài, không ký Luật Ánh Sáng, không có đường quay lại.

Cha thử 3 lần liên tiếp, mỗi lần OTP đúng nhưng vẫn không vào được — khớp chính xác với hành vi này.

Tài khoản mới thành công gần nhất: `letanchuong0202@gmail.com` — 24/08 **07:09:09Z** (Email OTP).
Sau mốc đó không có `auth.users` nào được tạo. **Cửa sổ lỗi: sau 07:09Z ngày 24/08.**

### CHƯA VERIFY được nguyên nhân chính xác của bước createUser
Log edge function + `postgres_logs` + `auth_logs` chỉ giữ ~1 giờ; thời điểm 09:42–09:46 đã bị rotate.
`sso-otp-verify` không còn log nào. `auth.audit_log_entries` trả về rỗng.
Hai nhánh có thể fail trong `supabase/functions/sso-otp-verify/index.ts` (cả hai đều trả về 500 và
KHÔNG tạo user do transaction rollback):
1. `supabase.auth.admin.createUser(...)` → nếu trigger `handle_new_user()` raise thì Postgres rollback toàn bộ,
   auth trả `Database error creating new user`, edge trả `"Failed to create user account"`.
2. `supabase.auth.admin.generateLink({type:'magiclink'})` → nếu fail, edge trả `"Failed to create session"`
   (trường hợp này user ĐÃ tồn tại → không khớp dữ liệu hiện tại, nên nhánh (1) khả năng cao hơn).

Chuỗi trigger chạy trong 1 transaction khi tạo user (mỗi cái đều có thể chặn):
`auth.users` → `on_auth_user_created` → `handle_new_user()` (INSERT profiles + user_roles) →
trên `profiles`: `check_reserved_username`, `check_username_format` (regex `^[a-z][a-z0-9_.]{2,29}$`),
`trigger_generate_fun_id`, `trg_normalize_wallet_addresses`, `trg_prevent_wallet_hijack`,
`trg_create_pet_for_new_user` (có EXCEPTION guard), `trigger_create_soul_nft` (KHÔNG có guard),
`trg_connector_open_window_insert` (KHÔNG có guard, đọc `connector_config`),
`trg_profiles_impersonation_scan` (có guard).

→ Muốn chốt nguyên nhân: cần **1 lần reproduce có chủ đích** để bắt log tươi (tạo user test qua
`sso-otp-verify` rồi đọc log ngay trong vòng vài phút). Chưa làm vì lệnh là chỉ audit.

## 1. Gửi OTP / email

1.1. Toàn bộ mail auth đi qua **Resend** (`supabase/functions/_shared/resendClient.ts` → `sendBrandedEmail`),
KHÔNG dùng mail mặc định của backend. `supabase/functions/auth-email-hook/index.ts` là **stub an toàn**
(Plan B: app tự gửi).

| Luồng | File | Provider |
|---|---|---|
| OTP đăng nhập/đăng ký | `sso-otp-request` | Resend qua `sendBrandedEmail` (`emailType: sso_otp`) |
| Xác nhận đăng ký email/password | `auth-signup-send-confirm` | Resend qua `sendBrandedEmail` |
| Quên mật khẩu | `password-reset-request` | Resend qua `sendBrandedEmail` |
| Xác minh email link | `send-email-link-verification` | Resend |
| Merge account (yêu cầu) | `sso-merge-request` | Resend gọi **trực tiếp** `api.resend.com` (không qua shared client → không ghi `email_delivery_logs`) |
| Merge account (duyệt) | `sso-merge-approve` | SDK `resend@2.0.0` trực tiếp (không log) |
| SSO webhook resend | `sso-resend-webhook` | SDK `resend@2.0.0` trực tiếp (không log) |

→ Không có chỗ nào còn dùng mail mặc định. **Lệch chuẩn:** 3 function merge/webhook không đi qua
`resendClient` nên không có log + không mask recipient (nợ kỹ thuật, không phải nguyên nhân sự cố hôm nay).

1.2. Không có dấu hiệu chạm rate limit/quota Resend: 3/3 `status=sent`, `error_message=NULL`.
Log chi tiết edge function tại 09:4x đã hết hạn lưu (CHƯA VERIFY phía dashboard Resend — Lovable không có quyền đọc).

## 2. Luồng ký Luật Ánh Sáng

2.1. Cột trạng thái **CÓ**: `profiles.law_of_light_accepted` (NOT NULL, default `false`) và
`law_of_light_accepted_at`. Toàn hệ thống: 1.577 đã ký / 143 chưa ký / 1.720 profile.
Với tài khoản test: **không có dòng profiles nào để kiểm tra** (xem kết luận gốc).

2.2. Chốt gác là `src/components/auth/LawOfLightGuard.tsx`: đọc `profiles.law_of_light_accepted`,
nếu false → `navigate('/law-of-light')`. Ba lỗ hổng thiết kế trong guard:
- `.single()` trên `profiles`: user **không có profile** → query lỗi → nhảy vào `catch` → **fail open**
  (`setIsAllowed(true)`) → user đi thẳng Home, không bị đẩy sang trang ký. Đây chính là "đi thẳng Home".
- `if (profile && !profile.law_of_light_accepted)`: `profile` là `null` thì **bỏ qua hoàn toàn** bước ký.
- Effect 3: sau lần check đầu, `wasAuthenticatedRef=true` ⇒ mọi route đều allow, **không kiểm tra lại**
  law_of_light trong cả session.

2.3. Trigger tạo profile: `on_auth_user_created` AFTER INSERT trên `auth.users` → `public.handle_new_user()`
(SECURITY DEFINER, INSERT `profiles` + `user_roles`, retry 5 lần khi trùng username).
Không có FE/edge nào tạo profile bù nếu trigger fail ⇒ **không có lớp phòng thủ thứ hai**.

2.4. Trang `/law-of-light` (`src/pages/LawOfLight.tsx`) **CÓ** nút ký:
5 checkbox cam kết + nút "CON ĐỒNG Ý & BƯỚC VÀO ÁNH SÁNG" (`handleAccept`) — chỉ enable khi tick đủ 5.
NHƯNG nút bị **ẩn hoàn toàn** khi URL có `?view=true` (`isReadOnly`): lúc đó trang chỉ để đọc,
chỉ còn nút "Về Trang Chủ"/"Đọc Hiến Pháp". Nếu Cha vào bằng link `?view=true` (menu/tài liệu)
thì đúng như Cha thấy: **không có hành động ký nào**.
`handleAccept` khi chưa đăng nhập chỉ ghi `localStorage['law_of_light_accepted_pending']='true'` →
mất sạch nếu đổi thiết bị/trình duyệt/xoá cache.

## 3. Nhánh "vào xem mà không đăng ký" (guest)

3.1. `handleSkip = () => navigate('/')`. **Không** set session, không set role, không ghi DB gì —
đúng nghĩa "xem tạm", không có việc biến thành user thật. Không phải lỗ hổng quyền.
3.2. **Không có đường quay lại**: không nút nào trong app dẫn về `/law-of-light` ở chế độ ký
(navigation chỉ trỏ tới bản `?view=true` — bản đã ẩn nút ký). User đã bấm "xem như khách"
chỉ còn cách tự gõ URL `/law-of-light` (không kèm `?view=true`). Đây là **lỗ hổng UX cần thiết kế thêm**,
không sửa được bằng 1 dòng code.

## 4. Tài khoản "treo" hiện có — CHƯA XỬ LÝ GÌ

```sql
select count(*) from auth.users u left join profiles p on p.id=u.id where p.id is null;
-- total_orphan = 1
-- dòng duy nhất: hoangtydo88@gmail.com | a39d467c-58b7-4347-9932-59a19eadf503 | 2026-01-27 04:11:31Z
```

→ Quy mô "user có auth nhưng thiếu profile" = **1 tài khoản duy nhất, từ 27/01/2026** (không liên quan sự cố hôm nay).
→ Sự cố hôm nay tệ hơn theo cách khác: **không có auth user nào được tạo từ 07:09Z 24/08** ⇒ 0 tài khoản mới
thành công trong ~3,5 giờ qua. Không đo được số người đã thử và thất bại (không có bảng log signup-failure).
Chưa xoá/sửa gì, chờ Cha duyệt phương án.

## Phát hiện phụ

- **P0-a — Không có bảng log thất bại signup.** Mọi lần createUser fail chỉ nằm ở log edge (~1 giờ) rồi mất sạch.
  Không thể biết bao nhiêu người mới đã bị chặn.
- **P0-b — Guard fail-open.** User thiếu profile hoặc mạng lỗi đều được cho vào app (`catch → setIsAllowed(true)`,
  và timeout 8s → allow). Kết hợp `.single()` ⇒ người chưa ký vẫn vào được Home.
- **P1-a — `sso-otp-verify` không có bước tạo profile bù** sau khi createUser thành công; hoàn toàn phụ thuộc trigger.
- **P1-b — `findUserByEmail` trong `sso-otp-verify` dò `profiles.username ilike 'prefix%'` rồi `listUsers` tối đa 2 trang
  (2.000 user).** Hiện có 1.720 profile → sắp vượt ngưỡng; khi vượt, user cũ sẽ bị coi là "mới" ⇒ nguy cơ
  `email_exists` / tạo trùng. Nợ kỹ thuật cần sửa trước khi vượt 2.000.
- **P1-c — `localStorage` là nơi duy nhất giữ "đã tick 5 cam kết" khi chưa login** ⇒ mất chữ ký khi đổi máy.
- **P2 — 3 function mail (`sso-merge-request`, `sso-merge-approve`, `sso-resend-webhook`) không đi qua
  `resendClient`** ⇒ không có `email_delivery_logs`, không mask recipient.
- Trong khung giờ audit, `postgres_logs` còn các ERROR khác không liên quan signup nhưng đang nổ liên tục:
  `column notifications.title does not exist`, `column live_sessions.archive_url does not exist`,
  `light_actions_action_type_check` violation, `too many values for in filter. Maximum 100`.
