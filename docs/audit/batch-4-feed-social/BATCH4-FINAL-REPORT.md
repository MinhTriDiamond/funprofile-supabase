# Batch 4 — Feed / Chat / Reels / Live / Pet / Mystery Box — BÁO CÁO CUỐI (chốt sổ 2026-08-19)

Phạm vi rà soát: ~68 bảng thuộc nhóm Feed, Chat, Reels, Live, Pet, Mystery Box.
Tất cả phát hiện đã đóng; bằng chứng raw nằm trong `evidence/`.

---

## 1. P0-1 — Client tự tạo đơn + tự đặt giá (Pet Shop + Mystery Box) — XONG

- Phương án (a): REVOKE `INSERT` của `authenticated`/`anon` trên `pet_shop_orders`,
  `mystery_box_orders` + policy `WITH CHECK (false)`.
- Luồng hợp lệ giữ nguyên qua RPC SECURITY DEFINER `pet_shop_create_order`,
  `mystery_box_create_order` (giá lấy từ catalog, không nhận từ client).
- Verify: `has_table_privilege('authenticated', …,'INSERT') = false`; thử INSERT đơn
  1 CAMLY tới treasury `0xdead` ⇒ 0 dòng.
- Bằng chứng: `evidence/p0-1-orders-insert-lockdown.txt` · Vitest `b4-orders-insert-lockdown.test.ts` (8).

## 2. P1-5 — Client tự set field hệ thống khi INSERT `posts` — XONG

- Trigger `trg_posts_sanitize_system_columns_on_insert` ghim
  `is_reward_eligible=false`, `moderation_status='approved'`, `content_hash/pplp_pillar/scored_at/scored_content_hash=NULL`
  khi role là `anon`/`authenticated`.
- Edge `create-post` ghi bằng `service_role` ⇒ giữ đúng kết quả overlap-check + `MIN_POST_LENGTH_FOR_LS`.
- Verify: INSERT bằng JWT user thường với `is_reward_eligible=true` ⇒ ghi ra `false`, 4 cột chấm điểm NULL.
- Bằng chứng: `evidence/p1-5-posts-insert-sanitize.txt` · Vitest `b4-posts-insert-sanitize.test.ts` (5).

## 3. P1-2 + P1-3 — Gate risk Lumi chỉ ở FE + cột mirror sửa được — XONG

- Helper `pet_risk_assert_allowed(user, action)` đọc `pet_risk_scores` (nguồn thật),
  nhúng vào `pet_shop_create_order`, `mystery_box_create_order`, `pet_cheer`;
  REVOKE EXECUTE khỏi PUBLIC/anon/authenticated.
- Trigger `trg_pet_states_freeze_system_columns` ghim `level`, `xp`, `risk_tier`.
- Verify (tier tạm = frozen): `shop/box/cheer = PET_RISK_FROZEN`, self-update level 999 ⇒ 1, xp 0, tier `safe`.
- Bằng chứng: `evidence/p1-2-p1-3-pet-risk-gate.txt` · Vitest `b4-pet-risk-gate.test.ts` (7).

## 4. P1-4 — Risk engine thất bại im lặng + join sai bảng trust — XONG

- Bảng trust thật là `trust_profile(did_id, tc)` (join qua `did_registry.owner_user_id`, 1.720 dòng, tc 0.300–0.843).
- Bọc `branch()` try/catch từng nhánh + trả `errors[]` ⇒ phát hiện & vá lỗi thật
  `shop_velocity: ReferenceError: dayAgo is not defined`.
- Chạy thật: `{"ok":true,"signals_inserted":0,"users_recomputed":0,"errors":[]}` — 0 signal là đúng dữ liệu.
- Bằng chứng: `evidence/p1-4-pet-risk-cron-fix.txt`.

## 5. P2 — Dọn least-privilege: REVOKE quyền ghi thừa của `anon` — XONG (2026-08-19)

- Trước: 65/68 bảng cho `anon` full `arwd`. Sau: 67/68 chỉ còn `SELECT` (hoặc không quyền nào).
- Đã kiểm tra trước khi REVOKE: không policy nào của 67 bảng đó cho `anon` ghi
  (mọi policy ghi đều yêu cầu `auth.uid()`/`has_role()`/`service_role`, hoặc `WITH CHECK false`).
- Verify thật bằng anon key (không đăng nhập): 5/5 bảng đại diện trả
  `42501 permission denied for table …` ⇒ chặn ở **tầng GRANT**, không chỉ RLS.
  `GET /posts` vẫn 200 ⇒ khách đọc nội dung công khai bình thường.
- Ngoại lệ có chủ đích: `video_downloads` giữ `INSERT` cho `anon`
  (policy `log own download`, `user_id IS NULL` — khách tải video công khai ghi 1 dòng log,
  đã REVOKE `UPDATE`/`DELETE` ⇒ append-only).
- Bằng chứng: `evidence/p2-anon-grant-cleanup.txt` · Vitest `b4-anon-grant-cleanup.test.ts` (6).

---

## Tổng kết

| Mã | Mức | Nội dung | Trạng thái |
|---|---|---|---|
| P0-1 | P0 | Tự tạo đơn / tự đặt giá Pet Shop + Mystery Box | Đã vá |
| P1-5 | P1 | Tự set `is_reward_eligible` & field chấm điểm trên `posts` | Đã vá |
| P1-2 | P1 | Gate risk Lumi chỉ ở FE | Đã vá |
| P1-3 | P1 | Cột mirror `level/xp/risk_tier` client sửa được | Đã vá |
| P1-4 | P1 | Risk engine sai join + lỗi im lặng | Đã vá |
| P2 | P2 | `anon` có quyền ghi thừa trên 65 bảng | Đã dọn |

- Vitest Batch 4: **26/26 pass** (4 suite).
- Linter sau toàn bộ migration Batch 4: 334 issue nền, **không phát sinh mới**.
- Rủi ro còn lại được chấp nhận có chủ đích: `video_downloads` append-only cho khách (ghi vào security memory).
