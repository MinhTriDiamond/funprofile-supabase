# Unified Transaction History — Consumer Gaps (Batch 2.3.1 kick-off)

_Snapshot 2026-07-06, sau khi kick-off Batch 2.3.1 (shadow probe `public_profile_history` bật)._

**RPC scopes hiện có**: `self` · `profile` · `global` · `admin_all` (audit log vào `admin_sql_audit`).

**RPC aggregate hiện có**: `get_unified_summary` · `get_unified_facets` · **`get_unified_admin_stats`** (Batch 2.3, admin-only).

## Ma trận trạng thái

| Surface | Hook / Source | Trạng thái | Batch xử lý |
| --- | --- | --- | --- |
| `/wallet/history` (HistoryTab) | `usePublicDonationHistoryAuto` (V2 khi flag ON) | ✅ **Cutover DONE** 2026-07-06 (Cha duyệt hướng a). Fallback flag `unified_public_history_ready` giữ 7 ngày. |
| `/:username` guest view (WalletTransactionHistory) | `usePublicDonationHistoryAuto` (V2 khi flag ON) | ✅ **Cutover DONE** 2026-07-06. Fallback 7 ngày. |
| `/transactions` (TransactionHistoryPage) | `useUnifiedTransactionHistory({scope:'self'})` | ✅ Unified | — |
| WalletHistoryPage (watched wallets) | `useExternalWalletActivity` | ⚠️ Read-only ngoài chuỗi, KHÔNG cần unified | Giữ nguyên |
| GlobalTransactionSummary | `useUnifiedTransactionSummary` | ✅ Unified | — |
| **Admin → Finance → Donations** (`DonationHistoryAdminTab`) | `useAdminDonationHistory` → `admin_all` + `get_unified_admin_stats` | ✅ Unified (Batch 2.2 + 2.3) | — |
| `useBenefactorLeaderboard` | `donations` direct | 🔒 Chờ G5 rebuild + Benefactor V2 | Batch 2.4 |
| `useWalletHistory` (edge `fetch-wallet-history`) | — | 💀 **Đã xoá** (Batch 2.3) | — |
| `useTransactionHistory` shim | — | 💀 **Đã xoá** (Batch 2.3) | — |
| `useDonationHistory` + `useDonationStats` | — | 💀 **Đã xoá** (Batch 2.3) | — |
| `SystemDonationHistory` component | — | 💀 **Đã xoá** (Batch 2.3) | — |
| `DonationHistoryTab` (wallet) | — | 💀 **Đã xoá** (Batch 2.3) | — |
| `DonationHistoryItem` component | — | 💀 **Đã xoá** (Batch 2.3) | — |
| `RecentTransactions` component | — | 💀 **Đã xoá** (Batch 2.3) | — |

Ký hiệu: ✅ done · ❌ cần migrate · ⚠️ có lý do giữ · 💀 dead code · 🔒 phụ thuộc

## Batch 2.3 — Kết quả

### N4 · RPC `get_unified_admin_stats` (migration 20260706_admin_stats)
- 1 RPC aggregate chạy trên `v_unified_transactions_primary`, trả jsonb:
  `total_count`, `confirmed_count`, `pending_count`, `today_count` (VN timezone
  server-side), `total_value`, `total_light_score`, `by_token`.
- Guard `has_role(auth.uid(),'admin')` → raise `FORBIDDEN` (42501) nếu không phải admin.
- Ghi audit vào `admin_sql_audit` best-effort.
- Dedup theo `source_table|source_id` (ưu tiên `direction='out'`) — cùng logic
  với scope `admin_all` để số liệu khớp tuyệt đối.
- Loại `metadata.shadow/debug/test` để không dính test data.

### N4b · `useAdminDonationHistory.stats` rewrite
- Xoá 5 query direct-read `donations` + vòng lặp phân trang `1000/page` (từng
  quét toàn bảng cho mỗi lần load).
- Thay bằng 1 call `supabase.rpc('get_unified_admin_stats')`.
- Kết quả: giảm ~5 RTT + full-scan → 1 aggregate SQL server-side.

### N3 · Dead code cleanup
Xoá 7 file (0 consumer sau khi verify bằng `rg`):
- `src/components/wallet/DonationHistoryTab.tsx`
- `src/components/wallet/DonationHistoryItem.tsx`
- `src/components/wallet/RecentTransactions.tsx`
- `src/components/donations/SystemDonationHistory.tsx`
- `src/hooks/useDonationHistory.ts` (kèm `useDonationStats`)
- `src/hooks/useTransactionHistory.ts`
- `src/hooks/useWalletHistory.ts`

Move `DonationRecord` type → `src/types/donation.ts` để 3 consumer còn lại
(`useAdminDonationHistory`, `exportDonations`, `DonationHistoryAdminTab`) import
từ nơi ổn định, không phụ thuộc hook đã xoá.

## Batch 2.3.1 — Rewrite `usePublicDonationHistory` (đang chạy)

### Kick-off 2026-07-06 — Shadow probe bật

Discovery quan trọng khi đọc lại view `v_unified_transactions`:

- View hiện đã emit swap dual-amount qua `metadata.pair_symbol` +
  `metadata.pair_amount` cho cả 2 leg (out có pair=to, in có pair=from) →
  **không cần** mở rộng view / RPC signature. V2 adapter chỉ cần giữ 1 leg
  (`direction='out'`) và đọc pair từ metadata để dựng `from/to_symbol` +
  `from/to_amount`.
- Scope `profile` hiện có đã handle guest access (auto `_public_only=true` khi
  caller ≠ target ≠ admin) → không cần scope `public_profile` mới.

Quyết định phạm vi Batch 2.3.1 (đã điều chỉnh nhẹ so với plan gốc):

- ~~Bước 1 (mở rộng view)~~ → BỎ, dùng metadata sẵn có.
- ~~Bước 2 (verify enrich)~~ → view `v_unified_transactions` đã trả sender/recipient enrichment; BTC aux verified có thể bổ sung sau nếu shadow probe phát hiện gap.
- Bước 3 (V2 adapter hook) → **Turn tiếp theo**, chờ ≥ 24h data probe để confirm shape.
- Bước 4 (shadow probe) → ✅ **Bật turn này** cho cả 2 consumer:
  - `HistoryTab` (`/wallet/history`): `useShadowCompare({surface:'public_profile_history', scope:'profile', targetUserId: effectiveUserId, legacyCount: summary.totalCount})`.
  - `WalletTransactionHistory` (guest view): cùng pattern với `targetUserId=userId`.
  - Sampling đọc `app_settings.unified_shadow_sampling` (admin luôn 1.0).
  - Diff report → `tx_shadow_diffs` qua edge `tx-shadow-report`.
- Bước 5 (cutover có cờ) → **Turn tiếp theo** sau khi V2 hook đạt zero-diff.
- Bước 6 (docs) → cập nhật ngay khi cutover.

### Trạng thái hiện tại

- [x] Shadow probe mounted trong `HistoryTab` + `WalletTransactionHistory`.
- [x] `useShadowCompare` hỗ trợ `scope: 'self' | 'profile'` + `targetUserId`.
- [x] `tsgo --noEmit` pass.
- [x] ~~48h zero-diff observation window~~ → bypass theo Cha directive (a) 2026-07-06.
- [x] Viết `usePublicDonationHistoryV2` (adapter dùng metadata dual-amount).
- [x] Cutover flag `unified_public_history_ready = true` trong `app_settings` (2026-07-06).
- [x] Cutover cả 2 consumer qua `usePublicDonationHistoryAuto` (2026-07-06).
- [ ] Xoá hook legacy `usePublicDonationHistory` (Batch 2.3.2 cleanup, sau 7 ngày stable).


## Không đụng ở Batch 2.3

- `useBenefactorLeaderboard` (chờ G5 rebuild + Benefactor V2 → Batch 2.4).
- `useWalletHistory` không cần xoá edge `fetch-wallet-history` (giữ cho
  `useExternalWalletActivity` — surface watched external wallets).
- Facet `token`/`chain`/`status` chung — đẩy sang Batch 2.5.
- Perf indexes cho view unified — Batch 2.5 sau khi có traffic scope
  `public_profile` thật để chọn đúng leading column.

## Acceptance Batch 2.3

- [x] `rg SystemDonationHistory|DonationHistoryTab|useDonationHistory|useDonationStats|useTransactionHistory|useWalletHistory|RecentTransactions src/` → 0 import active (hàm nội bộ trong `useBenefactorLeaderboard.ts` giữ nguyên, đây là function khác trùng tên).
- [x] `tsgo --noEmit` pass.
- [x] Admin Donations stats hiển thị đúng, chỉ 1 RPC `get_unified_admin_stats` (thay vì 5 query + loop).
- [ ] Bundle size delta sau build production — đo ở CI.
