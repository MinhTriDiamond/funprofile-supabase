# M6 Cleanup Checklist

## Phase 1 — Safe Removal (non-breaking, ~1 tuần)
- [ ] Thêm deprecation banner vào `useDonationHistory` (export shim)
- [ ] Thêm deprecation banner vào `usePublicDonationHistory`
- [ ] Thêm deprecation banner vào `useTransactionHistory`
- [ ] Set `unified_tx_read_enabled = true` trong `app_settings` (feature flag)
- [ ] Verify ShadowProbe diff = 0 trước khi tiếp tục

## Phase 2 — Migrate Surfaces (~2 tuần)
- [ ] `src/components/wallet/tabs/HistoryTab.tsx` → dùng `useUnifiedTransactionHistory`
- [ ] `src/components/wallet/DonationHistoryTab.tsx` → route đến `/wallet/history?type=donation`
- [ ] `src/components/profile/WalletTransactionHistory.tsx` → xoá, dùng ProfileHistoryEntry unified
- [ ] `src/components/donations/SystemDonationHistory.tsx` → xoá legacy branch khỏi Donations.tsx
- [ ] `src/components/wallet/ExportTransactionsMenu.tsx` → thay bằng `TransactionExportMenu`
- [ ] `src/utils/exportDonations.ts` → deprecated, redirect sang unified export
- [ ] `src/utils/export/mapRows.ts::mapDonationsToRows` → xoá, dùng `rowsFromUnified()`

## Phase 3 — Delete Legacy (~1 tuần)
- [ ] Xoá `src/hooks/useDonationHistory.ts`
- [ ] Xoá `src/hooks/usePublicDonationHistory.ts`
- [ ] Xoá `src/hooks/useTransactionHistory.ts`
- [ ] Xoá `src/hooks/useWalletHistory.ts` (dead hook)
- [ ] Xoá `src/utils/exportDonations.ts`
- [ ] Xoá `src/components/wallet/ExportTransactionsMenu.tsx`
- [ ] Xoá `src/components/donations/SystemDonationHistory.tsx`
- [ ] Xoá `src/components/profile/WalletTransactionHistory.tsx`
- [ ] Xoá `src/components/wallet/DonationHistoryTab.tsx`
- [ ] DB Draft (KHÔNG chạy ngay): DROP FUNCTION IF EXISTS get_donation_history(...);
- [ ] DB Draft: DROP FUNCTION IF EXISTS get_user_donation_summary(...);
- [ ] DB Draft: DROP FUNCTION IF EXISTS get_donation_global_stats(...) — kiểm tra Benefactors.tsx trước
