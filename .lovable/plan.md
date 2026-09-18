# Phase 1 — Kế hoạch migrate SCHEMA-ONLY sang database trống

Chỉ đọc. Turn này không tạo/sửa/xoá bất cứ thứ gì trong database, không deploy function, không sửa code.

## 1. Kiểm kê migration trong repo clone

- Tổng số file trong `supabase/migrations/`: **763 file**, tổng dung lượng **2,6 MB**.
- Sớm nhất: `20251105115957_44177db1-0bdd-4f27-a37f-cb5e2cf17926.sql` (05/11/2025).
- Muộn nhất: `20260916113317_79b52c92-7d07-45e3-9965-73981e3918e9.sql` (16/09/2026).
- Phân bố theo tháng: 2025-11: 16 · 2025-12: 13 · 2026-01: 32 · 2026-02: 113 · 2026-03: 93 · 2026-04: 76 · 2026-05: 168 · 2026-06: 95 · 2026-07: 57 · 2026-08: 88 · 2026-09: 12.
- Edge function trong repo: **287 thư mục** (`supabase/functions/`), `supabase/config.toml` trỏ `project_id = bhtsnervqiwchluwuxki` (project nguồn).

## 2. Nhóm migration KHÔNG an toàn khi replay trên DB trống

| Nhóm | Số file (ước lượng bằng quét nội dung) | Vấn đề |
|---|---:|---|
| Có câu lệnh INSERT/UPDATE/DELETE | 300 | Backfill dữ liệu nghiệp vụ, vô nghĩa trên DB trống |
| Chỉ có DML, không có CREATE/ALTER | 107 | Thuần sửa dữ liệu — bỏ hoàn toàn |
| Tên/nội dung liên quan backup, `_backup_YYYYMMDD`, backfill | 55 | Bảng backup sự cố production (BTC, wallet, donations spam…) |
| Có `cron.` | 41 | Tạo job định kỳ — phải hoãn tới Phase sau |
| Gọi `pg_net` / `net.http` | 31 | Gọi HTTP ra ngoài, có thể bắn request thật lúc replay |
| Tham chiếu `auth.users` | 53 | Phụ thuộc schema Supabase-managed (FK, trigger signup) |
| `storage.buckets` | 5 | Phải tạo bucket bằng công cụ chuyên dụng, không bằng SQL |
| `vault.` | 1 | Cần secret thật, không migrate |
| DROP TABLE / DROP COLUMN / TRUNCATE | 7 | Huỷ dữ liệu; trên DB trống chỉ gây lỗi nếu thứ tự lệch |

Ngoài ra nhiều bảng trong snapshot production là bảng vá sự cố một lần (`btc_*_audit_20260621`, `profiles_wallet_backup_20260601`, `donations_spam_backup_20260705`, `_backup_btc_p0_fix_20260713`) — **không tái tạo** ở môi trường mới.

## 3. Khuyến nghị: phương án B — baseline sạch

Replay toàn bộ 763 migration (phương án A) sẽ: chạy lại 107 file thuần dữ liệu, tái tạo ~15 bảng backup rác, tạo 36 cron job, bắn HTTP thật qua pg_net, và gần như chắc chắn gãy giữa chừng vì nhiều file được viết dựa trên trạng thái production tại thời điểm đó. Phương án C (hybrid) không có lợi vì mốc baseline chính là hiện tại — không còn migration hậu-baseline nào.

**Chọn B: sinh một baseline schema-only từ production hiện tại** (301 bảng, 15 view, 368 function, 164 trigger, 604 policy), lược bỏ bảng backup/incident, rồi nạp theo batch vào DB trống. Repo giữ nguyên 763 file lịch sử làm hồ sơ; migration mới bắt đầu từ baseline này.

Điều kiện tiên quyết (blocker cần Cha quyết): baseline phải được xuất từ database production `bhtsnervqiwchluwuxki` bằng `supabase db dump --schema-only` (hoặc pg_dump read-only qua connection string). Lovable trong dự án này chỉ nối tới DB đích mới, không đọc trực tiếp được DB cũ. Cha cần cung cấp file dump schema-only, hoặc cho phép dùng `scripts/fun-sql.sh` (read-only) để trích xuất DDL theo từng nhóm.

## 4. Extension và schema cần có trước

- Extension: `pgcrypto`, `pg_trgm`, `uuid-ossp`, `pg_net` (schema `extensions`), `pg_cron` (schema `pg_catalog`, chỉ bật khi tới Phase cron).
- Schema Supabase-managed đã có sẵn, không tạo lại: `auth`, `storage`, `realtime`, `vault`, `extensions`, `supabase_functions`.
- Role: `anon`, `authenticated`, `service_role` — mọi bảng public phải có GRANT tường minh.

## 5. Batch nạp schema theo thứ tự

1. **B1 — Extensions + enum types** (không bật pg_cron/pg_net nếu chưa cần).
2. **B2 — Bảng** (301 bảng, trừ bảng backup/incident), kèm GRANT + ENABLE RLS ngay trong cùng batch.
3. **B3 — Khoá ngoại, unique, check, index** (gồm FK tới `auth.users`).
4. **B4 — Function SQL/plpgsql** (368), gồm `has_role` SECURITY DEFINER; các function gọi `net.http` giữ nguyên định nghĩa nhưng không gắn cron.
5. **B5 — Trigger** (164 non-internal), gồm trigger trên `auth.users` cho luồng đăng ký.
6. **B6 — View** (15) và materialized view nếu có.
7. **B7 — RLS policy + GRANT rà soát lại** (604 policy), chạy linter bảo mật sau batch.
8. **B8 — Định nghĩa 6 Storage bucket** (tạo bằng công cụ bucket, sau đó policy trên `storage.objects` bằng migration).

Mỗi batch chia nhỏ 30–60 đối tượng/lần để dễ khoanh lỗi.

## 6. Kiểm chứng và điều kiện dừng cho từng batch

| Batch | Truy vấn kiểm chứng | Mốc kỳ vọng | Dừng khi |
|---|---|---|---|
| B1 | `select extname from pg_extension` | có pgcrypto, pg_trgm, uuid-ossp | thiếu extension |
| B2 | đếm `information_schema.tables` (public) | ≈ 285–301 | lệch > 5 bảng |
| B3 | đếm `pg_constraint`, `pg_indexes` | khớp snapshot ±2% | FK gãy do thiếu bảng |
| B4 | đếm `pg_proc` (public) | 368 | function lỗi biên dịch |
| B5 | đếm `pg_trigger` không internal | 164 | trigger trỏ function thiếu |
| B6 | đếm view | 15 | view thiếu cột nguồn |
| B7 | đếm `pg_policies` + linter | 604, linter 0 lỗi ERROR | có bảng RLS bật mà không policy |
| B8 | liệt kê bucket | 6 | sai chế độ public/private |

Rollback: DB đích đang trống nên rollback an toàn nhất là drop toàn bộ schema `public` và nạp lại từ B1 (chỉ hợp lệ khi **chưa** có dữ liệu thật). Sau khi bắt đầu nạp dữ liệu, quy tắc này hết hiệu lực.

## 7. Tuyệt đối CHƯA migrate ở Phase 1

Tài khoản người dùng (`auth.users`), mọi dòng dữ liệu nghiệp vụ, bảng backup sự cố, 36 cron job, secrets/`vault`, deploy 287 edge function, cấu hình OAuth provider, khoá ví blockchain, secrets Cloudflare/R2, secrets Sumsub, webhook Moralis/stream, cấu hình email provider.

## 8. Khuyến nghị GO/NO-GO

**NO-GO cho việc replay 763 migration.** **GO có điều kiện cho phương án B**: được phép bắt đầu tạo schema trên DB trống ngay khi có file dump schema-only từ production (hoặc Cha cho phép trích DDL read-only). Production `bhtsnervqiwchluwuxki` giữ nguyên chế độ chỉ đọc suốt toàn bộ dự án migrate.

## Câu hỏi cần Cha chốt

1. Cha xuất được `supabase db dump --schema-only` từ project cũ, hay muốn bé trích DDL read-only qua `admin-sql`?
2. Có giữ lại các bảng backup/incident (`*_backup_2026*`, `btc_*_audit_*`) ở môi trường mới không? Bé đề nghị bỏ.
