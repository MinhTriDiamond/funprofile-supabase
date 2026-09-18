# M6D · CONSUMER_GAPS.md — Danh sách consumer đang đọc số liệu lệch SSOT

Ngày: 2026-07-01 · Chế độ: **Audit read-only**.

---

## 1. Consumer đang đọc RPC/bảng sai chuẩn

| # | Surface | Hook / Component | RPC hoặc bảng | Vấn đề | M6E action |
|---|---|---|---|---|---|
| 1 | `/leaderboard/benefactors` | `useBenefactorLeaderboard.ts` | `get_benefactor_leaderboard` | Đọc trực tiếp `donations.amount_usd` → dính outlier CAMLY $359M | Migrate sang `get_unified_leaderboard('benefactor')` sau khi tokens_registry siết. |
| 2 | `/leaderboard/recipients` | `useRecipientLeaderboard.ts` | `get_recipient_leaderboard` | Cùng nguồn ô nhiễm | Migrate sang `get_unified_leaderboard('recipient')`. |
| 3 | Landing hero stats | `useEcosystemTotals.ts` | `get_ecosystem_totals` | Cùng nguồn | Migrate sang `get_unified_global_stats`. |
| 4 | Admin Dashboard | `useDashboardMetrics.ts` | `get_dashboard_metrics` | Đọc `donations + transactions` gộp — có risk double-count như TD-05 | Migrate sang `get_unified_global_stats` + `get_unified_token_breakdown`. |
| 5 | Profile widget "Top donator to you" | `useProfileTopDonators.ts` | Query trực tiếp `donations` | Có thể tính cả external | Đổi sang `get_unified_leaderboard('benefactor', _recipient_scope=user)`. |
| 6 | Profile wallet page | `useWalletPublicStats.ts` | `get_wallet_public_stats` | Chạy sum riêng donations + wallet_transfers → có risk double | Đổi sang `get_unified_summary_v2` cho user đó. |
| 7 | Detail modal Unified History | `useUnifiedTransactionDetail` | `get_unified_transaction_detail` | **Đọc raw view `v_unified_transactions`** — sẽ bị ảnh hưởng khi apply M6B-1 | Sửa RPC để đọc `v_unified_transactions_primary`. |
| 8 | Home feed "Vinh danh tháng" | `useMonthlyBenefactors.ts` | `get_benefactor_leaderboard` với filter month | Filter month client-side, có bug (audit benefactors) | Đổi sang RPC v2 với `_from/_to`. |
| 9 | Export CSV Benefactors | `exportBenefactorsCsv.ts` | Fetch từ leaderboard RPC | Thiếu cột `price_source`, `is_eligible_flag` | Bổ sung sau khi RPC v2 xong. |

## 2. Consumer đã dùng đúng SSOT (không cần đổi)

- `TransactionHistoryPage.tsx` → `get_unified_transactions` ✅
- `TransactionFilters.tsx` → `get_unified_counterparties` ✅
- `UnifiedTransactionSummary.tsx` → `get_unified_summary` ✅ (chỉ token totals, không USD nên không dính outlier)

## 3. FE reads bảng thô cần loại bỏ

Grep-checked (chưa xóa):

```
useDonations.ts             → SELECT * FROM donations                    (Legacy history — đã flag off)
useProfileTransactions.ts   → SELECT * FROM transactions                 (Legacy)
useExternalWalletActivity.ts→ SELECT * FROM wallet_transfers             (Có badge "Live", giữ)
```

Legacy hooks đã flag off qua `unified_tx_read_enabled`. M6F sẽ xóa hẳn.

## 4. Ưu tiên fix

- **P0 (blocker cho leaderboard):** #1, #2, #3, #8 — dính CAMLY outlier.
- **P1 (sau khi apply M6B-1):** #7 — chuyển detail RPC sang view primary.
- **P2:** #4, #5, #6 — cleanup double-count nhẹ.
- **P3:** #9 — export polish.

## 5. Bé đã KHÔNG sửa gì

Tất cả file trong table trên vẫn nguyên trạng. Chờ Cha duyệt.
