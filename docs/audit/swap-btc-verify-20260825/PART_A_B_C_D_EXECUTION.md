# A/B/C/D — Thực thi sau CTO Confirm (2026-08-25)

## A — REVOKE default privileges `anon`

**Phạm vi thực tế rộng hơn 1 bảng.** Nguyên nhân gốc: `pg_default_acl` của role
`postgres` trên schema `public` cấp `anon=arwdDxtm` cho **mọi bảng mới** ⇒ 198/278
bảng public đang mang grant này (không do migration nào cấp tay).

Đã chạy migration:
- Thu hồi `ALL … FROM anon` trên **89 bảng** có grant `anon=arwdDxtm` nhưng **không có
  policy nào cho `anon`/`public`** ⇒ grant vô nghĩa, RLS vốn đã chặn ⇒ revoke là no-op
  về hành vi, giảm bề mặt tấn công (gồm `swap_failures`, `app_secrets`, `app_secrets_audit`,
  `admin_sql_audit`, `email_confirm_tokens`, `btc_*_audit_*`, `_backup_btc_p0_fix_20260713`, …).
- `swap_failures`: `anon` = không quyền; `authenticated` chỉ còn `SELECT` (đúng policy
  admin-only); `service_role` = ALL.

**Còn tồn (báo riêng, CHƯA sửa):** 109 bảng khác vẫn có `anon=arwdDxtm` nhưng **có**
policy áp cho `anon`/`public` (đa số là policy đọc công khai chính đáng: profiles,
posts, …). Revoke ở nhóm này có thể phá tính năng đọc-khách ⇒ cần rà từng bảng.
Ngoài ra `pg_default_acl` vẫn sẽ cấp `anon` full cho **bảng tạo mới trong tương lai**;
sửa gốc phải `ALTER DEFAULT PRIVILEGES … REVOKE ALL ON TABLES FROM anon` — chờ CTO duyệt
riêng vì đụng mọi migration về sau. Tất cả 278 bảng public **đều đã bật RLS** (0 bảng thiếu).

## B — Dry-run quét bù 357 địa chỉ → **DỪNG, KHÔNG GHI**

Cấu hình: `mempool.space/api/address/{addr}/txs`, 20 req/phút (sleep 3s), 357 địa chỉ
(355 aux legacy + 2 địa chỉ hỏng), cửa sổ 21/06/2026 → nay.

| Chỉ số | Kết quả |
|---|---|
| Địa chỉ query OK | 355 |
| Địa chỉ lỗi 400 | 2 — chính là `178qtdaz…` và `3jrhcdbargfib…` (khẳng định lại: Base58 không hợp lệ, không tồn tại on-chain) |
| Địa chỉ có tx trong cửa sổ | **207** |
| tx on-chain trong cửa sổ **không có trong DB** | **5.395 dòng / 5.207 txid duy nhất** |
| Khoảng thời gian | 2026-06-21 01:47 → 2026-08-25 11:22 UTC (còn hoạt động tới hôm nay) |

⚠️ **Diễn giải trung thực:** đây gần như chắc chắn **KHÔNG phải 5.207 donation bị bỏ sót**.
Rất nhiều địa chỉ bị API cắt ở mốc 50 tx gần nhất và vẫn phát sinh giao dịch liên tục
đến hiện tại — dấu hiệu của **địa chỉ công khai/sàn bị scanner auto-learn gán nhầm vào
`profile_btc_aux_addresses`** (đúng nghi vấn "auto-learn noise" đã nêu ở đợt trước),
chứ không phải ví do user sở hữu.

⇒ Theo lệnh: **dừng tại đây, không ghi bất kỳ dòng nào**. Cần CTO/Cha quyết:
1. Trước tiên **xác thực quyền sở hữu** 355 aux address (dòng nào có bằng chứng verified,
   dòng nào là auto-learn) — nếu là noise thì phải void, không backfill.
2. Chỉ sau khi lọc còn tập ví thật-sở-hữu mới dựng Preview ghi nhận.

Dữ liệu thô: `/tmp/btcscan/txs.jsonl`, `missing_window.json` (sandbox, sẽ mất khi reset —
nói nếu cần export vào repo).

## D — Xoá 2 địa chỉ BTC hỏng + thông báo

UPDATE đã chạy (2 rows). Query xác nhận:

```
                  id                  |     username      | btc_address |          updated_at
--------------------------------------+-------------------+-------------+------------------------------
 7adc5b10-8733-402d-ba7e-c14887c2382b | phongyknb984t341b |    (NULL)   | 2026-08-25 11:06:14.150393+00
 d170050a-46d8-4790-9721-0e976d879338 | angelthaihoa      |    (NULL)   | 2026-08-25 11:06:14.150393+00
```

Notification (system identity FUN.RICH), type mới `btc_address_cleared`:

```
        type         |     username      | read |          created_at
---------------------+-------------------+------+------------------------------
 btc_address_cleared | phongyknb984t341b |  f   | 2026-08-25 11:07:43.177456+00
 btc_address_cleared | angelthaihoa      |  f   | 2026-08-25 11:07:43.177456+00
```

Nội dung: "₿ Địa chỉ BTC đã được xoá — Địa chỉ Bitcoin bạn khai trước đây không hợp lệ
nên đã được xoá để tránh mất tiền. Vui lòng khai lại…", bấm vào → `/profile?tab=edit`.
Đã đăng ký trong `systemNotifications.ts` (SYSTEM_TYPES + text + route) và icon ở
`notifications/utils.ts`.

## C — CHECK constraint tầng DB (chạy SAU D, đúng thứ tự)

```sql
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_btc_address_format_chk
  CHECK (btc_address IS NULL
      OR btc_address ~ '^bc1[a-z0-9]{25,59}$'
      OR btc_address ~ '^[13][1-9A-HJ-NP-Za-km-z]{25,39}$') NOT VALID;
```

Đã áp dụng. `NOT VALID` ⇒ chỉ chặn ghi mới; có thể `VALIDATE CONSTRAINT` sau khi rà hết
dữ liệu cũ (2 dòng hỏng duy nhất đã về NULL nên khả năng validate được ngay — chờ duyệt).
