# P0 — createUser fail: ĐÃ TÌM RA NGUYÊN NHÂN GỐC (24/08/2026)

Trạng thái: **REPRODUCED 4/4 lần, xác định chính xác trigger raise**. Chưa sửa — chờ CTO duyệt.

## 1. Nguyên nhân gốc

Trigger `BEFORE INSERT ON public.profiles` **`check_username_format`** →
`public.validate_username_format()` yêu cầu:

```sql
IF NEW.username !~ '^[a-z][a-z0-9_.]{2,29}$' THEN
  RAISE EXCEPTION 'Username must be 3-30 characters, start with lowercase letter, ...';
```

Bắt buộc **ký tự đầu là chữ cái a-z**.

Nhưng `public.handle_new_user()` (trigger trên `auth.users`) sinh username bằng:

```sql
base_username := lower(trim(COALESCE(raw_user_meta_data->>'username', SPLIT_PART(NEW.email,'@',1))));
base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');
```

→ username có thể bắt đầu bằng **số** hoặc **dấu gạch dưới**.

Vòng `LOOP ... EXCEPTION WHEN unique_violation` trong `handle_new_user` **chỉ bắt
`unique_violation`**. Lỗi `P0001` (RAISE EXCEPTION) không được bắt → propagate lên
`auth.users` INSERT → **toàn bộ transaction rollback** → GoTrue trả
`500 unexpected_failure`. Không tạo được user, không có tài khoản "nửa vời".

Trigger thứ hai cũng raise không guard: `check_reserved_username_trigger` →
username thuộc danh sách reserved (`admin`, `test`, `demo`, `support`, `api`, `mail`…)
→ cùng cơ chế fail.

**Vì sao "không ổn định"**: không liên quan tải hay 2 trigger nghi vấn ban đầu
(`trigger_create_soul_nft`, `trg_connector_open_window_insert`) — nó **phụ thuộc 100%
vào email/username của từng người đăng ký**. Ai có email/username bắt đầu bằng số,
bằng `_`, hoặc trùng từ khoá reserved → fail 100%. Người khác → thành công 100%.

**Lỗ hổng validation phía frontend**: `src/lib/username-validation.ts` dùng
`USERNAME_REGEX = /^(?=.{3,30}$)[a-z0-9]+(?:_[a-z0-9]+)*$/` — **cho phép ký tự đầu là số**.
Frontend cho qua, DB chặn ⇒ user thấy lỗi 500 vô nghĩa.

## 2. Bằng chứng reproduce có kiểm soát (12:20 UTC 24/08/2026)

25 tài khoản `qa-repro-20260824-*@fun-profile-test.invalid` tạo qua `auth.admin.createUser`:

| Biến thể | Mô tả | Kết quả |
|---|---|---|
| A-burst | 10 tài khoản song song (tải cao) | 10/10 **OK** |
| B-spaced | 5 tài khoản cách nhau 2s | 5/5 **OK** |
| C-dup | 5 tài khoản username TRÙNG HOÀN TOÀN (nhánh retry) | 5/5 **OK** (retry `_xxxx` chạy đúng) |
| D-leading-digit | `username = "1309qarepro20260824"` | **FAIL 500** |
| D2-email-digit | email localpart bắt đầu bằng số, không meta | **FAIL 500** |
| E-reserved | `username = "test"` | **FAIL 500** |
| F-underscore | `username = "_qarepro20260824"` | **FAIL 500** |

⇒ Tải KHÔNG phải nguyên nhân. Nhánh retry username KHÔNG phải nguyên nhân.

### Log auth nguyên văn (auth_logs, 2026-08-24T12:20:56Z)

```json
{"component":"api","duration":80737679,
 "error":"failed to close prepared statement: ERROR: current transaction is aborted, commands ignored until end of transaction block (SQLSTATE 25P02): ERROR: Username must be 3-30 characters, start with lowercase letter, contain only lowercase letters, numbers, dots and underscores (SQLSTATE P0001)",
 "error_code":"unexpected_failure","level":"error","method":"POST","msg":"request completed",
 "path":"/admin/users","request_id":"01a033b7-777d-7541-8b44-c6cebba1f8b3","status":500,
 "time":"2026-08-24T12:20:56Z"}
```

```json
{"error":"failed to close prepared statement: ERROR: current transaction is aborted ... : ERROR: Username \"test\" is reserved and cannot be used (SQLSTATE P0001)",
 "error_code":"unexpected_failure","status":500,"request_id":"01a033b7-76b7-7a37-ae09-f8713b689280",
 "time":"2026-08-24T12:20:56Z"}
```

## 3. ĐỀ XUẤT SỬA (chưa thực hiện — chờ CTO duyệt)

Ưu tiên theo thứ tự, không đụng logic nghiệp vụ:

1. **P0 — Sửa `handle_new_user()` sinh username luôn hợp lệ** (an toàn nhất, không đụng
   validator đang bảo vệ dữ liệu):
   - Sau khi strip regex: nếu `base_username !~ '^[a-z]'` thì prefix `'u'`
     (ví dụ `1309tri` → `u1309tri`).
   - Nếu `base_username` thuộc danh sách reserved → append hậu tố random 4 ký tự.
   - Đổi `EXCEPTION WHEN unique_violation` thành `EXCEPTION WHEN unique_violation OR raise_exception`
     và ở lần retry cuối dùng username fallback chắc chắn hợp lệ
     `'u' || substr(replace(NEW.id::text,'-',''),1,12)` → **không bao giờ chặn được đăng ký**.

2. **P1 — Đồng bộ regex frontend** `src/lib/username-validation.ts`:
   `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$` (bắt buộc chữ cái đầu) + chặn danh sách reserved
   ngay ở form, kèm message tiếng Việt rõ ràng.

3. **P2 — Thêm danh sách reserved dùng chung** giữa DB trigger và frontend để không lệch.

Rủi ro sửa: thấp. Không thay đổi username của user hiện có, chỉ ảnh hưởng nhánh
sinh username tự động khi tạo mới.

## 4. Dọn dẹp

- 20 tài khoản test tạo thành công: đã xoá posts → profiles → auth.users. Verify
  `profiles_left = 0`, `auth users test = 0`.
- 4 tài khoản fail: transaction rollback hoàn toàn, không để lại `auth.users` nào.
- 7 orphan row (`pet_states` 1, `connector_windows` 6) là tồn đọng cũ từ 02–08/2026,
  KHÔNG phải của đợt test này — ghi nhận vào backlog vệ sinh DB.
