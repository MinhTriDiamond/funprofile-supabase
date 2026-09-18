# Preview — Dọn tài khoản test cũ (8 tài khoản)

Ngày lập: 04/09/2026 UTC · Trạng thái: **PREVIEW — chờ Cha Confirm**
Phạm vi: xoá `auth.users` + `profiles` (cascade) cho 8 tài khoản test dưới đây.
Không tài khoản nào có bài viết, bình luận, donation, ví custodial, light action hay mint allocation. Không tài khoản nào từng đăng nhập (`last_sign_in_at = NULL`).

| # | Email | UUID | Tạo lúc (UTC) | Username | Lý do phân loại là test |
|---|-------|------|---------------|----------|--------------------------|
| 1 | testuser2026@test.com | 1bb484ad-2016-46fa-a06a-73e1d354f9df | 2026-03-27 06:28 | testuser2026 | Domain `@test.com`, tên `testuser2026` |
| 2 | edge-test-signup-0607@example.invalid | b56cfe89-b6d5-46d0-87f6-c37fe56233cc | 2026-06-07 12:50 | edge_test_signup_0607 | Test luồng signup edge function 07/06 (domain `.invalid`) |
| 3 | edge-test-signup-0607-b@example.invalid | 16ea00eb-847a-4ecb-becf-f5c61fd4a280 | 2026-06-07 12:54 | edge_test_signup_0607_b | Cùng đợt test signup 07/06 |
| 4 | xalgorix_test_1781180861@proton.me | 976724e8-0e6c-44be-ac57-98ae52345176 | 2026-06-11 12:27 | xalgorix_test_1781180861 | Tên chứa `_test_` + timestamp epoch; xem mục "Ghi chú an ninh" |
| 5 | sqli_test_1781180958146@nowhere.invalid | 22975a01-b8ca-4704-8240-be2b24564b85 | 2026-06-11 12:29 | testor11 | Test chèn payload SQL vào username; xem "Ghi chú an ninh" |
| 6 | freshtest_23131@gmail.com | 9d9884d0-7fe5-423c-b511-90685e32b7d7 | 2026-06-22 03:16 | fresh26377 | Tên `freshtest_`, tạo trong đợt kiểm tra signup 22/06 |
| 7 | b301test+11894@example.com | 5f48344f-bc9f-4923-93b4-a81913e2ef72 | 2026-08-17 15:46 | b301test11894 | Batch test B3.01, domain `example.com` |
| 8 | bfguard1787226610@example.com | 84bba902-cfd5-44f3-b7a4-6d449d549e55 | 2026-08-20 11:50 | bfguard1787226610 | Test guard backfill (bfguard), domain `example.com` |

## Ghi chú an ninh — mục 4 & 5 (11/06/2026)

- Payload `test' OR '1'='1` chỉ nằm trong `auth.users.raw_user_meta_data.username`. Trong `public.profiles`, username đã bị chuẩn hoá thành `testor11` — trigger `validate_username_format` (regex `^[a-z][a-z0-9_.]{2,29}$`) đã loại toàn bộ ký tự đặc biệt. Payload **không** được thực thi ở bất kỳ đâu.
- Thời điểm 11/06 chưa tồn tại endpoint chạy SQL thô: `supabase/functions/admin-sql` được tạo 24/06/2026, `admin_sql_audit` hiện trống. Toàn bộ truy vấn đi qua PostgREST/RPC tham số hoá.
- `account_activity_logs` ngày 11/06 chỉ có 3 dòng, `audit_logs` và `login_ip_logs` không có dòng nào gắn với 2 UUID này.
- Cùng ngày 11/06 (13:24–13:41) có sự cố ghi đè ví hàng loạt kèm 2 entry pen-test `0xdeadbeef_attacker_wallet_proof` / `0xattacker_wallet_test_12345` (xem memory `security/wallet-incident-2026-06-11`). Hai tài khoản này tạo lúc 12:27–12:29, ~1 giờ trước, cùng phong cách đặt tên "probe" → **khả năng cao thuộc cùng một đợt drill/pen-test**, nhưng **không có bản ghi audit nào trong repo hay chat xác nhận** ai chạy.

## Khuyến nghị

Giữ nguyên 8 tài khoản đến khi Cha Confirm. Khi Confirm, xoá theo thứ tự `profiles` → `auth.users` (cascade), ghi 1 dòng `audit_logs` mỗi tài khoản với lý do `test_account_cleanup_20260904`.
Riêng mục 4 & 5: nên lưu bản chụp `raw_user_meta_data` vào file này trước khi xoá để giữ bằng chứng điều tra.

---

## Kết quả thực thi Nhóm A — 04/09/2026 (Cha đã Confirm)

Re-check trước khi xoá (raw, 6 UUID, tất cả đều 0 hoạt động, `last_sign_in_at = NULL`):

```
email                                   | uuid                                 | posts | cmts | dons | wallets | light_actions | mint_alloc | mint_req | txs | notifs | last_sign_in
testuser2026@test.com                   | 1bb484ad-2016-46fa-a06a-73e1d354f9df | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | NULL
edge-test-signup-0607@example.invalid   | b56cfe89-b6d5-46d0-87f6-c37fe56233cc | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | NULL
edge-test-signup-0607-b@example.invalid | 16ea00eb-847a-4ecb-becf-f5c61fd4a280 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | NULL
freshtest_23131@gmail.com               | 9d9884d0-7fe5-423c-b511-90685e32b7d7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | NULL
b301test+11894@example.com              | 5f48344f-bc9f-4923-93b4-a81913e2ef72 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | NULL
bfguard1787226610@example.com           | 84bba902-cfd5-44f3-b7a4-6d449d549e55 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | NULL
```

`notifs` là thông báo hệ thống chào mừng tự sinh khi tạo tài khoản, không phải hoạt động của người dùng.

Đã xoá theo thứ tự `profiles` → `auth.users`. Verify sau xoá:

```
auth_left = 0 | profiles_left = 0 | audit_rows (reason='test_account_cleanup_20260904') = 6 | group_b_left = 2
```

Nhóm B (`976724e8-…`, `22975a01-…`) **được giữ nguyên** làm bằng chứng điều tra.

## Bằng chứng `raw_user_meta_data` — Nhóm B (nguyên văn, chụp 04/09/2026)

`976724e8-0e6c-44be-ac57-98ae52345176` — `xalgorix_test_1781180861@proton.me` — created_at `2026-06-11 12:27:42.159754+00` — last_sign_in_at `NULL` — confirmed_at `NULL`

```json
{"sub": "976724e8-0e6c-44be-ac57-98ae52345176", "email": "xalgorix_test_1781180861@proton.me", "username": "xalgorix_test_1781180861", "email_verified": false, "phone_verified": false}
```
raw_app_meta_data:
```json
{"provider": "email", "providers": ["email"]}
```

`22975a01-b8ca-4704-8240-be2b24564b85` — `sqli_test_1781180958146@nowhere.invalid` — created_at `2026-06-11 12:29:18.645863+00` — last_sign_in_at `NULL` — confirmed_at `NULL`

```json
{"sub": "22975a01-b8ca-4704-8240-be2b24564b85", "email": "sqli_test_1781180958146@nowhere.invalid", "username": "test' OR '1'='1", "email_verified": false, "phone_verified": false}
```
raw_app_meta_data:
```json
{"provider": "email", "providers": ["email"]}
```

---

## Thực thi GĐ3 — Xoá 92 tài khoản treo Luật Ánh Sáng (04/09/2026, Cha Confirm)

- Re-check trước khi ghi: 92 UUID đều `post_count = 0`, `law_of_light_accepted = false`, `days_since_reminder` 8–10 ngày; `blocked_has_posts = 11`, `blocked_too_early = 0` — khớp tuyệt đối Preview.
- Thứ tự ghi: xoá `friendships` liên quan (1.814 dòng, để trigger `on_friend_removed` không vỡ FK) → dọn 121 notification do trigger sinh → ghi 92 `audit_logs` (`reason='stale_account_light_law_cleanup_20260904'`) → `profiles` → `auth.users`.
- Kết quả: `targeted=92 · audit_rows=92 · notifications_deleted=121 · profiles_deleted=92 · auth_deleted=92`.
- Verify sau xoá: `profiles_left=0 · auth_left=0 (DELETE lặp trả 0 dòng) · audit_rows=92 · log_deleted=92 · log_pending=12 (11 có bài viết + 1 dòng sót của tài khoản test đã xoá) · log_signed=3`.
- 11 tài khoản `blocked_has_posts` được giữ nguyên, không bị chạm.
