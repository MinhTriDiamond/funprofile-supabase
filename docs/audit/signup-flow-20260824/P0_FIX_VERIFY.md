# P0 — Bản sửa + VERIFY runtime (12:45Z 24/08/2026)

## 0. Log thất bại signup (bắt buộc, đã xong)

- Bảng `public.signup_failure_log` (source, email_input, username_input, sqlstate, error_message, context, occurred_at).
- RPC `log_signup_failure(...)` — ghi log **trước khi trả lỗi cho client**, gọi từ 4 edge function:
  `auth-signup-send-confirm`, `sso-register`, `sso-otp-verify`, `sso-web3-auth` (helper dùng chung
  `supabase/functions/_shared/signupFailureLog.ts`).
- GoTrue chỉ trả message chung `"Database error creating new user"` (không lộ SQLSTATE) ⇒ thêm
  RPC **`diagnose_signup_failure(source, email, username)`**: thử INSERT `profiles` trong
  sub-transaction rồi **luôn RAISE để rollback** (không để lại bất kỳ dữ liệu / side-effect nào),
  bắt `RETURNED_SQLSTATE` + `MESSAGE_TEXT` thật rồi ghi vào log với source `<fn>:probe`.
  Chỉ `service_role` được EXECUTE.

## 1. Sửa 3 nhánh lỗi trong `handle_new_user()`

| Nhánh | Cách xử lý |
|---|---|
| Ký tự đầu là số / `_` | prefix `u` (`1309tri` → `u1309tri`) |
| Username reserved (18 tên) | append hậu tố random 4 hex (`test` → `test69b1`) |
| Base quá dài | cắt base về **25 ký tự** trước khi cộng `_xxxx` ⇒ tối đa 30 |
| Trùng tên | retry 5 lần với hậu tố random |
| Hết retry / P0001 đã biết | fallback tất định `u<uid12>` ⇒ **không bao giờ chặn đăng ký** |
| **Mọi lỗi khác** | **KHÔNG fallback — RAISE nguyên văn** để lộ ra log/`auth_logs` |

## 2. VERIFY runtime

### 2.1 Ba nhánh cũ (trước đây 500) — 7/7 tạo được user

| Case | username meta | username sinh ra | Kết quả |
|---|---|---|---|
| leading digit | `1309qaverify0824` | `u1309qaverify0824` | 200 OK |
| underscore đầu | `_qaverify0824` | `u_qaverify0824` | 200 OK |
| reserved | `test` | `test69b1` | 200 OK |
| base 26 ký tự | `abcdefghijklmnopqrstuvwxyz` | `abcdefghijklmnopqrstuvwxy` (25) | 200 OK |
| base 26 + trùng | idem | `abcdefghijklmnopqrstuvwxy_941f` (30) | 200 OK |
| trùng tên #1/#2 | `dupqaverify0824` | `dupqaverify0824` / `..._af29` | 200 OK |

### 2.2 Lỗi lạ (chưa từng biết) phải RAISE + được log

Tạm cài trigger giả `TMP_P0_FAKE_FAILURE` trên `profiles` (đã DROP sau khi test):

- Admin API trực tiếp: `500 {"code":"P0001","message":"TMP_P0_FAKE_FAILURE: nhánh lỗi lạ chưa từng biết"}`
  ⇒ **không bị fallback nuốt**.
- Qua edge `auth-signup-send-confirm`: trả 400 cho client **và** ghi 1 dòng
  `signup_failure_log` (source `auth-signup-send-confirm`, message `Database error creating new user`).
- Probe `diagnose_signup_failure` trả đúng SQLSTATE thật:
  - `1badname` → `P0001` "Username must be 3-30 characters, start with lowercase letter…"
  - `test` → `P0001` "Username \"test\" is reserved…"
  - username hợp lệ → `23503` FK `profiles_id_fkey` (đúng: probe không có `auth.users` tương ứng)
  - Kiểm tra sau probe: `probe_leftover = 0` ⇒ rollback sạch.

### 2.3 Đồng bộ frontend

- `src/lib/username-validation.ts`: `USERNAME_REGEX = /^[a-z][a-z0-9_.]{2,29}$/` (khớp nguyên văn DB)
  + `RESERVED_USERNAMES` 18 tên + `isReservedUsername()`.
- Thông báo lỗi i18n `authErrorUsernameFormat` viết lại (VI/EN) nêu rõ "bắt đầu bằng chữ cái a-z".
- Test guard `src/__tests__/username-validation-db-parity.test.ts` — **4/4 pass**.

## 3. Dọn dẹp

7 tài khoản test `*@fun-profile-test.invalid` đã xoá. Verify: `profiles_left = 0`,
`auth_left = 0`, `probe_leftover = 0`. Trigger giả đã DROP.

## 4. Còn theo dõi bị động

Case gốc `leminhtri.camlycoin@gmail.com` 09:42Z 24/08 vẫn **chưa xác định nguyên nhân**
(log đã rotate). Từ nay mọi lần tái diễn sẽ tự ghi vào `signup_failure_log` kèm SQLSTATE thật
qua probe ⇒ đủ dữ kiện chẩn đoán ngay lần sau.

Truy vấn theo dõi:
```sql
SELECT occurred_at, source, email_input, username_input, sqlstate, error_message
FROM signup_failure_log ORDER BY occurred_at DESC LIMIT 50;
```
