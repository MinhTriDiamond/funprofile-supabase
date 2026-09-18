# Phase 1 (bản sửa) — Migrate SCHEMA-ONLY từ baseline production hiện tại

Chỉ đọc. Turn này không chạy migration, không ghi database, không deploy function, không sửa code. Production `bhtsnervqiwchluwuxki` giữ read-only tuyệt đối.

## 1. Chốt phương án

Không replay 763 migration lịch sử (2,6 MB, sớm nhất `20251105115957_…`, muộn nhất `20260916113317_…`; trong đó 107 file thuần DML, 300 file có DML, 55 file dính backup/backfill, 41 file tạo cron, 31 file gọi pg_net). Dùng **baseline schema hiện tại của production**.

### Cách lấy baseline
- **Ưu tiên 1:** `supabase db dump --schema-only` (hoặc `pg_dump --schema-only --no-owner --no-privileges` qua connection string read-only) trên production hiện tại. Đây là nguồn chuẩn duy nhất.
- **Dự phòng (chỉ khi không dùng được dump):** trích DDL từ catalog (`pg_catalog` / `information_schema` / `pg_get_functiondef` / `pg_get_viewdef` / `pg_policies`) qua đường read-only. Cách này dễ sót default, comment, thứ tự phụ thuộc — chỉ dùng khi bắt buộc.

## 2. Danh sách ứng viên loại bỏ (không loại theo tên một cách mù quáng)

Quy trình bắt buộc cho mỗi ứng viên: soát tham chiếu từ **function, view, trigger, policy, FK, và mã ứng dụng** (`src/`, `supabase/functions/`) trước khi quyết định.

Kết quả rà mã nguồn (đã thực hiện):

**Nhóm A — an toàn loại (0 tham chiếu trong `src/` và edge function):**
`_backup_btc_p0_fix_20260713`, `btc_aux_cleanup_audit_20260621`, `btc_donations_wrong_father_backup_20260621`, `btc_father_aux_full_backup_20260621`, `btc_father_backfill_audit_20260621`, `btc_full_reconcile_audit_20260621`, `btc_transactions_orphan_backup_20260621`, `btc_wallet_transfers_orphan_backup_20260621`, `donations_spam_backup_20260705`, `profiles_wallet_backup_20260601`.

**Nhóm B — phải giữ vì đang được tham chiếu:**
- `btc_history_repair_audit_20260612` — dùng trong `supabase/functions/btc-history-repair/index.ts`.
- `btc_aux_misattribution_audit_20260612` — dùng trong `supabase/functions/scan-btc-transactions/index.ts`.

**Nhóm C — cần xem tay trước khi chốt:**
`donations_broad_flag_backup`, `donations_camly_reference_backup`, `agora_backup_fallback_legacy_config` (tên có "backup" nhưng có thể là bảng cấu hình đang dùng), cùng mọi bảng `*_log`, `*_audit` không gắn ngày. Với mỗi bảng: kiểm FK trỏ tới/đi, xuất hiện trong định nghĩa function/view/policy, và tham chiếu trong code. Chỉ loại khi cả 6 kênh đều sạch.

Quy tắc chặn: nếu bất kỳ đối tượng giữ lại nào phụ thuộc vào một bảng thuộc nhóm A thì bảng đó chuyển sang nhóm B và được giữ.

## 3. Mốc đếm kỳ vọng ở ĐÍCH — tính lại sau khi loại

Không dùng số nguồn 301/15/368/164/604/6 làm mốc kiểm chứng. Sau khi chốt danh sách loại, tạo **bảng mốc đích** bằng cách: đếm trên baseline dump sau khi đã bỏ nhóm A và nhóm C-đã-duyệt, cộng các đối tượng phụ thuộc bị bỏ theo (index, FK, policy, trigger, grant của chính các bảng đó).

Mốc dự kiến với 10 bảng nhóm A bị loại: bảng ≈ **291**; view, function, trigger, policy giảm đúng bằng số đối tượng gắn với 10 bảng đó — con số cuối cùng chốt từ dump, không ước lượng. Bucket: **6**, không đổi.

Sản phẩm bắt buộc trước khi chạy batch: file `docs/migration/phase1-target-counts.md` ghi mốc đích chính xác cho từng loại đối tượng.

## 4. Preflight — kiểm tra phụ thuộc trước khi nạp

1. Liệt kê mọi FK từ bảng `public` trỏ tới `auth.users`, và mọi trigger gắn trên `auth.users` (repo có 53 file migration chạm `auth.users`). Xác nhận đích cho phép tạo lại từng cái, hoặc thay bằng cơ chế tương đương ở tầng `public`.
2. Liệt kê tham chiếu tới schema Supabase-managed: `auth`, `storage`, `realtime`, `vault`, `extensions`, `supabase_functions`. Không tạo/sửa các schema này; chỉ ghi nhận phụ thuộc.
3. Xác nhận extension cần có: `pgcrypto`, `pg_trgm`, `uuid-ossp`. `pg_net` và `pg_cron` **không bật** ở Phase 1.
4. Xác nhận role `anon` / `authenticated` / `service_role` và mọi bảng giữ lại đều có GRANT tường minh trong baseline.

## 5. Luật cấm trong Phase 1

Không kích hoạt bất cứ thứ nào sau đây: cron job (36 job trong repo), gọi `net.http`/`pg_net`, secrets và `vault`, tài khoản `auth.users`, dữ liệu nghiệp vụ, deploy 287 edge function, cấu hình provider ngoài (OAuth, Moralis, Sumsub, Cloudflare/R2, email, stream webhook), khoá ví blockchain. Function nào gọi HTTP vẫn được tạo định nghĩa nhưng không gắn lịch và không có secret.

## 6. Thứ tự batch nạp schema

1. **B1** — extensions + enum/domain types.
2. **B2** — bảng giữ lại, kèm GRANT rồi ENABLE RLS ngay trong cùng migration.
3. **B3** — FK, unique, check, index.
4. **B4** — function (gồm `has_role` SECURITY DEFINER).
5. **B5** — trigger (kể cả trigger `auth.users` nếu preflight cho phép).
6. **B6** — view / materialized view.
7. **B7** — RLS policy + soát lại GRANT, chạy linter bảo mật.
8. **B8** — định nghĩa 6 storage bucket (bằng công cụ bucket) + policy trên `storage.objects`.

Mỗi batch chia nhỏ 30–60 đối tượng.

## 7. Kiểm chứng và điều kiện dừng

| Batch | Kiểm chứng | Dừng khi |
|---|---|---|
| B1 | `select extname from pg_extension` | thiếu extension, hoặc pg_cron/pg_net bị bật ngoài ý muốn |
| B2 | đếm bảng public = mốc đích | lệch bất kỳ bảng nào so với danh sách giữ lại |
| B3 | đếm `pg_constraint`, `pg_indexes` = mốc đích | FK trỏ tới bảng đã loại |
| B4 | đếm `pg_proc` public = mốc đích | function lỗi biên dịch hoặc tham chiếu bảng đã loại |
| B5 | đếm trigger non-internal = mốc đích | trigger trỏ function thiếu |
| B6 | đếm view = mốc đích | view tham chiếu bảng đã loại |
| B7 | đếm `pg_policies` = mốc đích; linter 0 ERROR | có bảng bật RLS mà không policy |
| B8 | liệt kê bucket = 6, đúng public/private | sai chế độ truy cập |

Rollback: khi đích chưa có dữ liệu thật, rollback = drop schema `public` và nạp lại từ B1. Quy tắc này hết hiệu lực ngay khi có dòng dữ liệu đầu tiên.

## 8. Kiểm chứng sau batch cho tầng ứng dụng

`src/integrations/supabase/types.ts` hiện tại là **bản sao từ production cũ** — không được coi là bằng chứng schema đúng. Sau B7:

1. Sinh lại types từ **đích** (`supabase gen types typescript --project-id tljfqavndndfsvtazibe`).
2. Diff bản sinh mới với schema giữ lại: mọi bảng giữ lại phải có mặt; bảng đã loại phải biến mất.
3. Thay thế file types cũ bằng bản sinh mới, rồi chạy `tsgo` và build. Lỗi typecheck trỏ tới bảng đã loại là tín hiệu phân loại sai ở mục 2 — quay lại rà, không vá bằng cách khôi phục types cũ.
4. Chạy `bunx vitest run` cho phần chạm logic.

## 9. Checklist phê duyệt

- [ ] Có dump schema-only từ production (hoặc chấp nhận đường dự phòng catalog).
- [ ] Danh sách loại bỏ nhóm A/B/C đã được Cha duyệt.
- [ ] File mốc đếm đích đã lập từ dump.
- [ ] Preflight `auth.users` và schema Supabase-managed đã xong.
- [ ] Xác nhận Phase 1 không bật cron/net/secrets/deploy/dữ liệu.
- [ ] Thống nhất quy trình sinh lại types và tiêu chí build pass.

## 10. GO / NO-GO

**NO-GO** cho replay 763 migration. **GO có điều kiện** cho nạp baseline theo batch: khởi động ngay khi đủ 6 mục checklist, đặc biệt là dump schema-only và danh sách loại bỏ được duyệt. Chưa đủ thì dừng ở bước chuẩn bị.
