# P0 — Làm rõ mâu thuẫn: nhóm lỗi vừa tìm CÓ PHẢI nguyên nhân sự cố 09:42Z 24/08? (12:40Z 24/08/2026)

Kết luận ngắn: **KHÔNG chắc.** Tìm thêm được **nhánh lỗi thứ 2 thật** (username dài + trùng tên),
nhưng cả 2 nhánh đều KHÔNG khớp với case gốc `leminhtri.camlycoin@gmail.com`.

## Bước 1 — Retry logic trong `handle_new_user()`

```sql
LOOP
  BEGIN
    INSERT INTO public.profiles (...) VALUES (NEW.id, final_username, ...);
    EXIT;
  EXCEPTION WHEN unique_violation THEN
    attempt := attempt + 1;
    IF attempt >= 5 THEN RAISE; END IF;          -- <== hết retry thì RE-RAISE
    final_username := base_username || '_' || substr(md5(random()::text), 1, 4);
  END;
END LOOP;
```

- Hết 5 lần → `RAISE` → propagate lên INSERT `auth.users` → rollback → GoTrue **500 unexpected_failure**.
  ⇒ **retry-exhausted LÀ một nhánh 500 độc lập, có thật trong code.**
- Nhưng xác suất thực tế cực nhỏ: mỗi retry sinh hậu tố random 4 hex (65 536 khả năng).
  Muốn hết 5 lần phải trúng trùng 4 lần liên tiếp ⇒ ~(n/65536)^4. Với vài chục bản trùng
  tiền tố, xác suất < 10^-13. **Không thể là nguyên nhân sự cố sáng nay.**
- Ràng buộc UNIQUE trên `profiles`: `username`, `username_normalized` (generated = lower(trim(username))),
  `id` (PK), `fun_id` (sinh bởi trigger `generate_fun_id`). `email` **KHÔNG** unique ⇒ không có
  nhánh "trùng email làm retry vô ích".
  ⚠️ Nếu `fun_id` trùng thì retry đổi username là vô ích với `fun_id` cố định — cần rà `generate_fun_id`
  ở Phase sau (ghi vào backlog, chưa phát hiện dấu vết thật).

## Bước 2 — Query bản ghi trùng tiền tố

```sql
SELECT username, created_at FROM profiles WHERE username ILIKE 'leminhtricamlycoin%' ORDER BY created_at;
-- (0 rows)
```
Cũng đã kiểm tra: hôm nay 24/08 chỉ có **1 profile** được tạo, lúc `07:09:09Z`.
⇒ Tại thời điểm 09:42Z **không có** bản ghi nào trùng tiền tố `leminhtricamlycoin`
(các tài khoản test trước đã bị Lovable xoá sạch ở các lượt trước).
⇒ **Giả thuyết retry-exhausted bị loại đối với case gốc.**

## Bước 3 — Reproduce 17 lần với pattern GIỐNG case gốc

Domain test `@fun-profile-test.invalid`, `auth.admin.createUser`, 12:35Z 24/08.

| Nhóm | Cấu hình | Kết quả |
|---|---|---|
| dup0–dup11 (12 lần) | username meta = `leminhtricamlycoinqa` (letter-start, 20 ký tự), trùng nhau hoàn toàn | **12/12 OK** — retry sinh `..._0a23`, `..._9ab3`… |
| case0–case2 (3 lần) | y hệt, chạy tiếp khi đã có 12 bản trùng tiền tố | **3/3 OK** |
| long0 | base 26 ký tự `abcdefghijklmnopqrstuvwxyz` | **OK** |
| long1 | cùng base 26 ký tự (bị trùng ⇒ retry thành 31 ký tự) | **FAIL 500** |

Log nguyên văn `long1`:
```json
{"code":"P0001","message":"Username must be 3-30 characters, start with lowercase letter, contain only lowercase letters, numbers, dots and underscores"}
```

### NHÁNH LỖI THỨ 2 (mới, thật)
`handle_new_user` cắt base tối đa **26 ký tự**, nhưng retry cộng thêm `_xxxx` (5 ký tự) ⇒ **31 ký tự**
> giới hạn 30 của `validate_username_format` ⇒ `P0001` không được bắt (chỉ bắt `unique_violation`) ⇒ **500**.
Điều kiện kích hoạt: **email/username ≥ 27 ký tự phần đầu VÀ bị trùng tên**. Username vẫn hợp lệ,
bắt đầu bằng chữ cái — nghĩa là *có* nhánh 500 không thuộc nhóm số/`_`/reserved.

Case gốc `leminhtri.camlycoin` → strip dấu chấm → `leminhtricamlycoin` = **18 ký tự** ⇒ + hậu tố = 23 ⇒
**không rơi vào nhánh này**.

## Bước 4 — Kết luận về sự cố gốc 09:42Z

> **Nhóm lỗi đã tìm (leading digit / `_` / reserved) + nhánh mới (username dài + trùng tên) là
> LỖI THẬT CẦN SỬA, nhưng CHƯA chắc là nguyên nhân sự cố sáng 24/08.**
> Case gốc `leminhtri.camlycoin@gmail.com` → username `leminhtricamlycoin`: letter-start, 18 ký tự,
> không reserved, không có bản trùng tiền tố tại thời điểm đó. **Không tái hiện được bằng 17 lần thử.**
> ⇒ **Sự cố gốc coi như CHƯA xác định được nguyên nhân, chuyển sang theo dõi bị động.**

Hạn chế bằng chứng: `auth_logs` chỉ còn giữ log từ ~12:20Z (đợt repro của Lovable);
log 09:42Z đã rotate mất, nên không thể đọc trực tiếp SQLSTATE của sự cố gốc.
Đề xuất theo dõi bị động: khi có lỗi 500 `/admin/users` hoặc `/signup` xuất hiện lại, chụp log
`auth_logs` + `postgres_logs` trong vòng 15 phút (trước khi rotate).

## Trả lời 2 câu hỏi về bản sửa

1. **`raise_exception` có bắt luôn nhánh retry-exhausted không?**
   Có, nếu viết đúng: đổi handler thành `EXCEPTION WHEN unique_violation OR raise_exception OR check_violation THEN`
   và **ở lần thử cuối (attempt = 5) dùng thẳng username fallback tất định** `'u' || substr(replace(NEW.id::text,'-',''),1,12)`
   thay vì `RAISE`. Khi đó:
   - nhánh leading digit / `_` / reserved: bắt được (P0001 = `raise_exception`);
   - nhánh username 31 ký tự: bắt được (cũng P0001) — và nên sửa gốc bằng cách cắt base về **25 ký tự**
     trước khi cộng hậu tố;
   - nhánh retry-exhausted: không còn `RAISE` ⇒ luôn có username hợp lệ, không bao giờ chặn đăng ký.

2. **Fallback `u<uid12>` có phá logic nào không?** Không:
   - khớp regex DB `^[a-z][a-z0-9_.]{2,29}$` (13 ký tự, bắt đầu `u`, phần còn lại hex a-f0-9);
   - khớp regex frontend `src/lib/username-validation.ts` (`[a-z0-9]+(?:_[a-z0-9]+)*`, 3–30);
   - URL `/:username` và tìm kiếm dùng `username` / `username_normalized` (lower(trim)) ⇒ an toàn,
     không dấu, không hoa, không ký tự đặc biệt;
   - không nằm trong danh sách reserved (không phải từ khoá hệ thống);
   - va chạm với `id` là PK duy nhất ⇒ fallback duy nhất theo user.

## Dọn dẹp

17 tài khoản repro (`qa2*@fun-profile-test.invalid`): 16 tạo thành công đã xoá posts → profiles → auth.users.
Verify: `profiles còn = 0`, `auth users theo domain test còn = 0`. Tài khoản `long1` fail rollback hoàn toàn.
