# V2 Step 2.3 — USD Ranking Table Polish

**Date**: 2026-07-03
**Scope**: Presentation-only redesign của USD Ranking table (donors + recipients).

## Changes

### New files
- `src/components/benefactors/UsdRankingRow.tsx` — 1 hàng rank card. Rank badge overlay avatar, USD compact + full, progress bar theo top1, top-3 token chips (+N nếu còn), FUN aux badge `ecosystem` (chỉ hiện nếu data có sẵn từ RPC, KHÔNG gọi thêm query), meta `⭐ light_score · N tx`. Responsive: mobile stack + USD nổi bật trong cột giữa; desktop grid với USD ở cột phải.
- `src/components/benefactors/UsdRankingList.tsx` — wrapper list, skeleton loading, empty state, tính `topUsd` một lần rồi truyền xuống row.

### Edited
- `src/pages/Benefactors.tsx`
  - Bỏ `renderDonorRow`, `renderRecipientRow`, `renderTokenTotals`, `getRankIcon`, `getRankBg`, `formatCoin`.
  - Adapter map `BenefactorEntry` / `RecipientEntry` → `UsdRankingRowData` (chỉ đổi field name, cùng 1 RPC response).
  - 2 `TabsContent` giờ chỉ render `<UsdRankingList rows={...} isLoading={...} onRowClick={id => navigate('/profile/${id}')} />`.
  - Cleanup unused imports (`Avatar*`, `Trophy`, `Medal`, `Skeleton`, `getTxUrl`).

## Không đụng
- 3 RPC USD (`get_benefactor_leaderboard`, `get_recipient_leaderboard`, `get_donation_global_stats`).
- Hook `useBenefactorLeaderboard` / `useRecipientLeaderboard` (chỉ đọc).
- `StatisticsHero`, `TokenOverviewStrip`, `RankingSegmentedTabs`, `BenefactorTokenRankingSection`, `ContributionDimensionsPanel`, `BenefactorRuleBanner`, `ExportCsvDialog`.
- Rank order, scanner, Unified History, DB/migration.

## FUN aux policy (không N+1)
- Chỉ đọc `row.totals_by_token['FUN']` từ chính RPC response hiện có.
- KHÔNG gọi thêm RPC / query trong UsdRankingRow.
- Nếu FUN đã lọt top-3 chip theo USD → không lặp badge aux.
- Nếu USD RPC hiện tại không trả FUN → badge aux sẽ im lặng ẩn (đúng scope). Không "hack" để force hiển thị.

## Validation

### Grep proofs
Xem `evidence/v2_step2_3_grep.txt`.
- `src/components/statistics/` không thêm domain literal mới; các match `Token` còn lại là type name generic của TokenOverviewStrip (đã có từ 2.2, không phải Benefactor/Donation/FUN specifics).
- `src/components/statistics/` **0 match** cho `useBenefactorLeaderboard|useRecipientLeaderboard|useTokenLeaderboard|useContributionDimensions`.

### Regression
- **father #1** ($1.05M) — pass.
- **funtreasury #2** ($97.0K) — pass.
- KPI Statistics Hero không đổi ($1.64M · 402 · 865 · 24.9K).
- Token Overview strip không đổi.
- Token Ranking segment không đổi.
- Ecosystem segment (`ContributionDimensionsPanel`) không đổi.

### Screenshots
- `evidence/v2_step2_3_desktop.png` (1280×1800)
- `evidence/v2_step2_3_tablet.png` (834×1200)
- `evidence/v2_step2_3_mobile.png` (390×1400)

### Build / typecheck
`bunx tsgo --noEmit` → PASS.

## Rollback
```
rm src/components/benefactors/UsdRankingList.tsx src/components/benefactors/UsdRankingRow.tsx
git checkout src/pages/Benefactors.tsx
```

## Out of scope (đợi phase sau)
- Drawer chi tiết user click row (2.4+).
- Ecosystem panel polish (2.4).
- Export CSV mở rộng (2.5).
- Mở rộng RPC để trả FUN aux thống nhất.
