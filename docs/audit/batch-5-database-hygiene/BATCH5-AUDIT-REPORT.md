# BATCH 5 — Vệ sinh Database & Schema (AUDIT ONLY)

Ngày: 19/08/2026 · Phạm vi: schema `public` (272 base table + 14 view), 695 migration file, 276 edge function.
**Chưa sửa/xoá bất cứ thứ gì.** Toàn bộ số liệu lấy trực tiếp từ DB production.

---

## 5.1 — Schema drift (DB thật vs migration files)

| Chỉ số | Kết quả |
|---|---|
| Bảng trong DB thật | 272 |
| Bảng KHÔNG tìm thấy `CREATE TABLE` trong `supabase/migrations/` | **9 (3,3%)** |
| Cột không tìm thấy dấu vết trong migrations | 0 / 3520 (0%) — lưu ý: phép đo theo tên cột nên bị nhiễu bởi tên cột trùng giữa các bảng, không đủ mạnh để kết luận "0% drift cột" |

9 bảng drift (đều là bảng backup/audit tạo tay trong lúc xử lý sự cố BTC/ví):
`_backup_btc_p0_fix_20260713`, `btc_aux_cleanup_audit_20260621`, `btc_father_aux_full_backup_20260621`,
`btc_father_backfill_audit_20260621`, `btc_full_reconcile_audit_20260621`,
`btc_transactions_orphan_backup_20260621`, `btc_wallet_transfers_orphan_backup_20260621`,
`live_co_hosts`, `reward_claims`.

Đánh giá: drift bảng thấp (3,3%) và **8/9 là bảng rác/tạm**. Hai bảng cần chú ý thật sự là
`live_co_hosts` và `reward_claims` — đây là bảng nghiệp vụ đang chạy nhưng không có migration tương ứng
⇒ nếu dựng lại môi trường từ migrations sẽ thiếu 2 bảng này. Khuyến nghị (chưa làm): viết migration
`CREATE TABLE IF NOT EXISTS` bù cho 2 bảng đó.

Kết luận: nguyên tắc cũ "pg_dump là nguồn sự thật" vẫn đúng, nhưng mức drift đã đo được là **3,3%**,
không phải mất kiểm soát.

---

## 5.2 — Bảng "mồ côi"

Đã grep tên bảng qua `src/` (trừ test + `types.ts`) + `supabase/functions/`, rồi đối chiếu thêm với
định nghĩa view (`pg_views`) và source của toàn bộ DB function (`pg_proc.prosrc`).

### A. Mồ côi thật — chỉ là bảng backup/audit sự cố (12, ~5,9 MB)
`btc_full_reconcile_audit_20260621` (3607 dòng), `profiles_wallet_backup_20260601` (1515),
`btc_history_repair_audit_20260612` (1156), `btc_wallet_transfers_orphan_backup_20260621` (425),
`btc_transactions_orphan_backup_20260621` (365), `btc_donations_wrong_father_backup_20260621` (269),
`btc_aux_misattribution_audit_20260612` (113), `btc_father_aux_full_backup_20260621` (51),
`donations_spam_backup_20260705` (40), `btc_aux_cleanup_audit_20260621` (36),
`_backup_btc_p0_fix_20260713` (18), `btc_father_backfill_audit_20260621` (11).

→ Ứng viên archive/drop **sau khi Cha xác nhận** các sự cố tương ứng đã đóng vĩnh viễn. Không cấp bách
(tổng dung lượng nhỏ), nhưng chúng đang làm nhiễu `types.ts` và mọi lần audit.

### B. Bảng rỗng, không tham chiếu — tính năng chưa bật (7, 0 dòng)
`pplp_audits`, `pplp_epoch_caps`, `pplp_evidences`, `provider_registry`, `provider_request_log`,
`user_reel_preferences`, và `pplp_v25_action_overrides_history` (1 dòng).
→ KHÔNG xoá: `provider_registry`/`provider_request_log` thuộc thiết kế Scanner RPC Phase 2 chưa dùng.

### C. Bảng cấu hình/tra cứu chỉ đọc trong DB (không lộ ra code) — GIỮ
`chains_registry` (11), `fun_pool_config` (3), `identity_levels` (3), `pplp_v2_action_types` (5),
`pplp_v2_immutable_rules` (4), `reserved_usernames` (76), `job_leases`, `pplp_daily_action_mint`,
`swap_price_validation_log`, `btc_aux_address_review_queue` (711).
→ Đây là **false positive** của phép grep: được dùng qua RPC/trigger/view. Tuyệt đối không dọn.

---

## 5.3 — Index & hiệu năng

Tổng dung lượng index schema `public`: **2 419 MB**.

### Top bảng theo dung lượng/row
| Bảng | Rows | Total size | Ghi chú |
|---|---:|---:|---|
| `live_session_events` | 7 132 416 | **6 846 MB** | seq scan 90 vs index scan 21; **không có retention** |
| `posts` | 217 270 | 757 MB | |
| `notifications` | 1 365 305 | 320 MB | |
| `light_actions` | 339 913 | 318 MB | |
| `reactions` | 488 939 | 182 MB | |

### Phát hiện lớn nhất: `live_session_events` không có retention
7,1 triệu dòng chỉ trong **26/05 → 19/08/2026** (~85 ngày, ~84k dòng/ngày). `cleanup_old_system_data()`
hiện chỉ dọn `chunked_recording_chunks` và `cron.job_run_details` (7 ngày) — **không dọn bảng này**.
Đây là bảng log kỹ thuật của live, giá trị chẩn đoán gần như bằng 0 sau vài ngày.
Khuyến nghị #1: thêm retention 14–30 ngày vào `cleanup_old_system_data()`. Ước tính thu hồi **> 6 GB**.

### Top khuyến nghị (theo thứ tự ưu tiên)
1. **Retention `live_session_events`** (thu hồi >6 GB) — quan trọng hơn mọi index bên dưới.
2. **DROP `idx_live_session_events_reason_created`** — 638 MB, `idx_scan = 0`.
3. **DROP `idx_notifications_read`** — trùng hoàn toàn `idx_notifications_user_read` (cùng `(user_id, read)`), 17 MB, 0 scan.
4. **DROP `ix_posts_user_created`** — trùng hoàn toàn `idx_posts_user_created` (cùng `(user_id, created_at DESC)`), 12 MB, 0 scan.
5. **DROP `idx_live_sessions_channel_name_unique`** — trùng constraint `live_sessions_channel_name_key`.
6. Cân nhắc drop (0 scan, >10 MB): `idx_posts_slug` (18 MB — nhưng slug tra cứu qua RPC, cần xác minh EXPLAIN trước), `idx_posts_media_urls` GIN (15 MB), `idx_posts_replay_status` (12 MB), `uq_v25_vvu_source` + `idx_v25_vvu_source` (41 MB — trùng cặp unique/non-unique), `idx_chunked_recording_chunks_recording` (15 MB — trùng `..._recording_id_seq_key`).
7. `pg_relation_size` của `live_session_events_pkey` = 153 MB nhưng `idx_scan = 0` ⇒ củng cố kết luận bảng này chỉ ghi, không đọc.
8. `reactions`: `idx_reactions_post_id` là **tiền tố** của `idx_reactions_post_type (post_id, type)` ⇒ dư 1 index.
9. `donations` có **26 index** trên 1 bảng — chi phí ghi cao cho scanner (mỗi INSERT cập nhật 26 cây). Nên rà lại nhóm `*_trgm` (3 GIN) xem còn dùng cho search không.
10. Chưa thấy bảng lớn nào **thiếu** index cho cột WHERE/JOIN phổ biến — vấn đề của dự án là **thừa index**, không phải thiếu.

Lưu ý: mọi khuyến nghị DROP INDEX cần chạy `EXPLAIN` xác nhận và không được làm trong giờ cao điểm.
`idx_scan = 0` có thể do stat bị reset — nên kiểm tra `pg_stat_reset` gần nhất trước khi drop.

---

## 5.4 — Cron jobs

Snapshot `cron.job`: **62 job gọi edge function** + **12 job gọi trực tiếp SQL/RPC**.

- **Job không rõ mục đích / trỏ tới edge function không tồn tại: 0.** Đã đối chiếu 100% 59 tên
  edge function trong cron với `supabase/functions/` — tất cả đều tồn tại. Sạch.
- **Trùng chức năng (cố ý, để stagger trong cùng 1 phút):**
  `concat-replay-webm-a` / `-b` (b có `pg_sleep(30)`), `live-replay-readiness-check-a` / `-b`.
  → Giữ, nhưng nên ghi chú rõ trong `docs/ops/cron-jobs-inventory.md`.
- **Trùng chức năng (đáng rà lại):** `live-replay-mp4-poll-every-1min` và
  `live-replay-rtmp-pending-rescue-hourly` cùng gọi `live-replay-mp4-poll-cron`. Job hourly gần như
  vô nghĩa khi job mỗi phút đã chạy — ứng viên xoá.
- **Tên job lệch schedule thật (gây hiểu sai khi vận hành):**
  `fast-scan-donations-every-minute` thực tế `*/3`; `live-replay-stream-ingest-every-5min` thực tế `*/2`;
  `auto-scan-donations-every-15min` đúng `*/15` (đã hạ tần theo đợt tối ưu Moralis).
- **Tải cron rất cao:** 20 job chạy `* * * * *` (mỗi phút), phần lớn thuộc live/replay.
  Nếu cần giảm chi phí edge invocation, đây là chỗ có dư địa lớn nhất.
- `docs/ops/cron-jobs-inventory.md` (snapshot 13/07) đã **lệch**: 2 job one-shot
  `registry-validate-report-24h/48h` đã tự unschedule đúng như thiết kế (không còn trong snapshot mới).

---

## Tổng kết Batch 5

| Mục | Mức độ | Việc cần làm (chưa làm) |
|---|---|---|
| 5.3 retention `live_session_events` | **Cao** (6,8 GB) | Thêm retention 14–30d |
| 5.3 index thừa/trùng | Trung bình (~750 MB) | DROP 5 index đã xác nhận trùng/0 scan |
| 5.2 bảng backup mồ côi | Thấp | Archive 12 bảng sau khi Cha chốt |
| 5.1 drift `live_co_hosts` + `reward_claims` | Thấp–TB | Viết migration bù |
| 5.4 cron | Thấp | Xoá 1 job trùng, sửa tên job lệch schedule, cập nhật inventory |

Không phát hiện lỗ hổng bảo mật mới trong Batch 5 (đúng tính chất batch dọn dẹp).
