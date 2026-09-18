# Batch 2.4 — Gói trình duyệt (Submission Package)

**Ngày:** 2026-07-06 · **Trình:** Lovable → Angel AI → Cha · **Trạng thái:** CHỜ DUYỆT

## 1. Phạm vi Batch 2.4

Hai luồng độc lập, có thể duyệt riêng hoặc gộp:

| # | Tên | SPEC | Mục tiêu |
|---|---|---|---|
| B1 | Benefactor Leaderboard V2 | [`benefactors-2026-07/V2_STEP3_LEADERBOARD_RPC_SPEC.md`](./benefactors-2026-07/V2_STEP3_LEADERBOARD_RPC_SPEC.md) | Thống nhất BXH đọc từ SSOT, hỗ trợ 3 dimension USD/Token/Ecosystem |
| B2 | External Wallet Watch scope | [`unified-tx-onehistory-2026-07/EXTERNAL_WALLET_SCOPE_SPEC.md`](./unified-tx-onehistory-2026-07/EXTERNAL_WALLET_SCOPE_SPEC.md) | Gộp lịch sử ví ngoài (watched) vào SSOT, bỏ read path song song qua edge `fetch-wallet-history` |

## 2. Tóm tắt kỹ thuật

### B1 — Benefactor V2
- **Deliverables:** 1 RPC mới `get_benefactor_leaderboard_v2(dimension, token_symbol?, time_range, include_btc, limit, offset)`; 2 index mới (`idx_donations_usd_created`, `idx_donations_sender_token_created`).
- **Không đụng:** RPC legacy `get_benefactor_leaderboard` (giữ song song để rollback).
- **Cutover:** hook `useBenefactorLeaderboard` swap qua feature flag `benefactor_v2_ready`.

### B2 — External Wallet Watch
- **Deliverables:** mở rộng `get_unified_transactions` + `get_unified_summary` chấp nhận `_scope='external_wallet_watch'` + `_watched_addresses text[]` + `_watched_chains text[]`; ownership verify chống leak cross-user.
- **Hook mới:** `useWatchedWalletHistoryV2` thay `useExternalWalletActivity`.
- **Cutover:** flag `external_wallet_v2_ready`, deprecate edge `fetch-wallet-history` sau 7 ngày zero-diff.

## 3. Rủi ro & Rollback

| Rủi ro | Xác suất | Ảnh hưởng | Rollback |
|---|---|---|---|
| Query V2 chậm hơn legacy | Thấp | BXH lag | Tắt flag → RPC cũ; index vẫn giữ |
| Ownership check sai → leak ví ngoài user khác | Rất thấp (unit test bắt) | Bảo mật | Tắt flag `external_wallet_v2_ready` |
| Zero-diff không đạt sau 7 ngày | Trung bình | Kéo dài giai đoạn dual-read | Không deprecate edge `fetch-wallet-history`, mở ticket root-cause |

## 4. Migration/Edge dự kiến (chưa apply)

1. Migration `<ts>_benefactor_leaderboard_v2.sql` — CREATE FUNCTION + 2 CREATE INDEX + GRANT EXECUTE authenticated.
2. Migration `<ts>_unified_external_wallet_scope.sql` — mở rộng signature 2 RPC + ownership verify block.
3. Không có edge function mới. Sau cutover: DELETE FUNCTION edge `fetch-wallet-history` (batch riêng).

## 5. Câu hỏi cần Cha quyết

1. **B1 — BTC dimension:** bật ngay trong `get_benefactor_leaderboard_v2` (mặc định `_include_btc=false`, có thể chuyển `true` sau G6), hay chờ hẳn G6 cutover mới thêm param?
2. **B2 — Deprecate edge `fetch-wallet-history`:** sau 7 ngày zero-diff cutover thì xoá hẳn edge function, hay giữ thêm 30 ngày dạng shim log-only?
3. **Thứ tự:** làm B1 trước hay B2 trước? (Đề xuất: B2 trước vì có tác động bảo mật + gộp SSOT triệt để hơn.)

## 6. Acceptance chung

- Linter Supabase pass (security definer + search_path=public).
- Unit test SQL cho mỗi RPC ≥ 5 case.
- Zero-diff 48h giữa RPC mới vs path cũ trên 3 QA user.
- Bundle size không tăng (B2 dự kiến giảm ≥ 4KB gzip).

## 7. Ngoài phạm vi Batch 2.4

- Materialized view cho BXH (chờ đo p95 sau khi bật).
- Xoá RPC legacy `get_benefactor_leaderboard` (batch cleanup sau).
- Migration BTC ownership (thuộc G5/G6, đang chạy Nhánh A).
