# Batch 2 — Tổng hợp tình trạng còn treo (cập nhật 2026-08-16, sau A1 đợt 3)

## 1. Nhóm A1 (function admin-only đang hở guard) — ĐÃ ĐÓNG

| Mốc | Số lượng | Tình trạng |
|---|---|---|
| Tổng A1 xác định ban đầu | **38** | — |
| Đợt 1 (2026-08-14) | 5 | ✅ ĐÃ SỬA |
| Đợt 2 (2026-08-15) | 3 | ✅ ĐÃ SỬA |
| Đợt 2 — phân loại lại, không guard admin | 4 | ✅ ĐÓNG (RPC user thường) |
| Việc 2 — tách `get_user_directory_summary` / `get_user_directory_admin` | 1 | ✅ ĐÃ SỬA (23 cột công khai / 28 cột admin; `usdt_received` = **công khai**, chỉ SUM từ `donations`) |
| Đợt 3 (2026-08-16) — quét lại ACL thật | 25 (phần dư trên giấy) | ✅ ĐÓNG — không còn function admin-only nào hở; xem `2.3-a1-batch3-report.md` |
| Attester (`get_attester_dashboard_stats`, `get_attester_mint_requests` ×2) | 3 overload | 🟡 P2 hoãn — cần chuẩn hoá `public_wallet_address` cho 11 ví (hiện 2/11) |

## 1b. Verify sâu A2/A3 (2026-08-16) — `2.6-a2-a3-deep-verify-report.md`

- A2 30/30 đọc thân thật: **đều có `auth.uid()` khớp bản ghi** ⇒ sạch.
- A3: phát hiện **2 lỗ hổng thật, đã vá** — `get_user_mint_stats(text)` (P1: mọi user đăng nhập dump được ví + mint stats toàn hệ thống, nay admin-only) và `get_user_directory_totals()` (P2: anon xem được tổng `pending/approved_reward`, nay yêu cầu đăng nhập). Verify 42501 bằng publishable key.
- ✅ `get_all_claim_history()`: **Cha chốt PA (a) giữ nguyên công khai** (2026-08-16, nguyên tắc "công khai = đã hoàn tất"). Đã rà, không sửa code/ACL; ghi memory `policy/public-claim-history-intentional`.

## 2. Mục 4 — Validate input 5 function tài chính/identity

- ✅ `claim-reward` (P1): **ĐÃ SỬA** — thêm `supabase/functions/claim-reward/validateClaimInput.ts` (validate + BigInt string-based, 3 decimals CAMLY, chặn `1e21`/NaN/âm/0/quá 3 số thập phân/trần 1e9), ví **lowercase** ngay đầu luồng. Guard `src/__tests__/claim-reward-input-guard.test.ts` (21/21 pass). Không dùng zod để module chạy được cả Deno và Vitest.
- ✅ `record-swap` P2: **ĐÃ SỬA** — `validateSwapInput.ts` (BigInt string-based theo decimals từng token, chặn ký hiệu khoa học/NaN/≤0/quá decimals, USD ≤ 2 số thập phân, maxLength dex_provider/quote_id). Phần "USD client tự khai" nêu 3 phương án chờ CTO ở `BATCH2-FINAL-REPORT.md` §2.1.
- ✅ `identity-dispute-submit/resolve` P2: **ĐÃ SỬA** — whitelist enum, maxLength, UUID chuẩn (`validateDisputeInput.ts`, `validateResolveInput.ts`).
- ✅ Nợ P2 đối chiếu ví `claim-reward`: **ĐÃ LÀM** — không chặn cứng, gắn fraud signal `CLAIM_WALLET_MISMATCH` + badge đỏ "Ví khác với ví đăng ký" ở tab duyệt admin.
- 📄 Tổng kết cuối: `BATCH2-FINAL-REPORT.md` (danh sách đã đóng + 7 hạng mục backlog đã xếp lịch).
- `pplp-authorize-mint`: ĐÓNG (đã `410 Gone`, không đọc body).
- `delete-user-account`: hiện trạng đã mô tả đầy đủ tại `2.7-delete-user-account-current-flow.md` — **hard delete ngay, không xác nhận, không grace period**; chờ Cha/CTO bàn thiết kế.
- Nợ này đã đóng: xem gạch đầu dòng đối chiếu ví ở trên.

## 3. Mục 5 — Sửa cơ chế `wallet_writer` tag

🔴 **CHƯA LÀM**, 3 điều kiện tiên quyết đã giải thích chi tiết + trạng thái tại `2.5-muc5-wallet-writer-prerequisites.md`: (1) gắn tag cho mọi writer — 465/465 dòng vẫn `writer_tag = NULL`; (2) quyết đường FE self-edit (~97% lượt ghi) đi qua edge function có tag hay thêm tag `self-service-profile`; (3) audit-only ≥ 7 ngày với `is_allowed` ≥ 99%. Không thể hoàn tất dưới 7 ngày.

## 4. Chính sách đã chốt trong Batch 2 (không mở lại)

- **Đối soát tài chính chỉ người thật** — `.lovable/memory/policy/financial-reconciliation-human-only.md`.
- **Minh bạch F1** — ví + dòng tiền quà tặng là dữ liệu công khai (kéo theo `usdt_received` công khai).
- **BXH stub wallet** — `mem://governance/leaderboard-stub-wallet-exclusion`, đã đóng.

## 5. Việc tiếp theo đề nghị CTO xếp thứ tự

1. Mục 4 — sửa validate `claim-reward` (P1) + `record-swap` + 2 dispute (P2).
2. `delete-user-account` — CTO duyệt thiết kế xác nhận + soft-delete.
3. Attester P2 — chuẩn hoá `public_wallet_address` 11 ví rồi siết sang `is_gov_attester(auth.uid())`.
4. Mục 5 — `wallet_writer` tag (dài hạn, ≥ 7 ngày audit).

