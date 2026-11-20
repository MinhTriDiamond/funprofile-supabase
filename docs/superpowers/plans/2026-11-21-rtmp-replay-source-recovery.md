# RTMP replay source recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho replay RTMP đã tồn tại nhưng thiếu UID tự phục hồi qua strict source validation.
**Architecture:** Tách recovery hiện có sang shared service để test. Giữ nguyên selector, mở recovery cho hàng chưa có nguồn/R2 và dùng conditional update cho race.
**Tech Stack:** TypeScript, Deno Edge Functions, Supabase, Vitest; không thêm thư viện.
**Spec:** `docs/superpowers/specs/2026-11-21-rtmp-replay-source-recovery-design.md`.

## Global Constraints

- Giữ nguyên strict source validation; không sửa file cấm/schema/secret/auth.
- Không xóa video không rõ nguồn; không tạo post công khai cho pre-live.
- Nhánh riêng, Preview/PR trước merge; backup trước mọi thao tác xóa production.

## Review Focus

- Hàng đã có R2 hoặc UID không bị reset.
- Metadata/video không khớp phiên không được dùng.
- Concurrent resolver thắng thì không cập nhật post/session từ dữ liệu thua race.
- Lỗi đọc/ghi DB không bị coi là không có hàng.
- Lease tương lai và trạng thái terminal được giữ nguyên.

### Task 1: Phục hồi nguồn có fencing

**Files:** thêm `_shared/rtmpReplayRecovery.ts`, sửa `live-replay-archive-cron/index.ts`, test `src/modules/live/rtmpReplayRecovery.test.ts`.
**Interfaces:** `recoverMissingRtmpReplays(admin): Promise<number>` dùng selector và feed service hiện có.

- [x] Viết regression test các trường hợp trong spec, chuyển nguyên recovery hiện có sang shared để chạy test và xác nhận thất bại tại replay có id/UID null.
- [x] Sửa guard/conditional update, giữ nguyên id; giữ healthy replay và không ghi post/session nếu strict mismatch hoặc race.
- [x] Test tập trung, matching/fencing và feed regression; tsgo; deno check entrypoint; full suite và ghi rõ lỗi có sẵn nếu gặp.
- [ ] Review diff độc lập, commit/push nhánh; lấy Preview đúng build và tạo PR. Không deploy Edge trước khi hoàn tất cổng dự án.

### Task 2: Hồ sơ vận hành

- [x] Hoàn tất backup ba recording, xác minh duration/codecs/hash và khả năng decode; ghi manifest không chứa secret.
- [x] Ghi kết quả kiểm kê 19 recording, lỗi auth inventory và giới hạn quyền R2; cập nhật mailbox.
- [ ] Lập danh sách xóa cụ thể và xin xác nhận tại thao tác vĩnh viễn; không coi backup đang tải là đã hoàn tất.
