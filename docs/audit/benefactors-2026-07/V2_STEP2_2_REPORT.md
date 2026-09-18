# Benefactors v2 — Sub-phase 2.2 Report

**Ngày:** 2026-07-03
**Scope:** Token Overview + Segmented Tabs (USD / Token / Ecosystem)

## Deliverables

### Component mới (generic — không literal nghiệp vụ)
- `src/components/statistics/TokenOverviewStrip.tsx` — strip token generic, click callback `onSelect`, mobile snap scroll.
- `src/components/statistics/RankingSegmentedTabs.tsx` — wrapper Tabs generic, nhận `segments[]`.

### Component nghiệp vụ (đặt trong `benefactors/`)
- `src/components/benefactors/BenefactorTokenRankingSection.tsx` — dùng `useTokenLeaderboard`, có select symbol + direction, empty state khi không có token.

### Refactor
- `src/pages/Benefactors.tsx`:
  - Thay strip totals-by-token cũ bằng `<TokenOverviewStrip>` (click token → set segment=token + set symbol).
  - Bọc 3 nội dung bằng `<RankingSegmentedTabs>`:
    - `usd` (mặc định): giữ nguyên `Tabs donors/recipients` cũ.
    - `token`: `BenefactorTokenRankingSection`.
    - `ecosystem`: `ContributionDimensionsPanel` hiện có.
  - Thêm persist key `benefactors-segment` (default `usd`).
  - Xoá `<ContributionDimensionsPanel>` đứng dưới cùng — đã chuyển vào tab Ecosystem.

## Architecture Validation

```
$ rg -n "Benefactor|Donation|FUN|USD" src/components/statistics/TokenOverviewStrip.tsx src/components/statistics/RankingSegmentedTabs.tsx
(0 matches)

$ rg -n "useBenefactorLeaderboard|useRecipientLeaderboard" src/components/statistics/
(0 matches)
```

- ✅ Statistics components hoàn toàn generic.
- ✅ Segment label `USD Ranking / Token Ranking / Ecosystem` chỉ đặt ở `Benefactors.tsx`.
- ✅ Không import USD leaderboard hooks vào `statistics/`.

## Regression

- USD Ranking tab hiển thị bảng cũ, không đổi thứ hạng: **father #1, funtreasury #2** (đọc từ RPC `get_benefactor_leaderboard` không đổi).
- `ContributionDimensionsPanel` vẫn hoạt động, đọc `ranking_dimension = ecosystem`.
- 3 RPC USD không đổi. Unified History, scanner, `tokens_registry`, `StatisticsHero`, `BenefactorRuleBanner` không đụng.

## Non-crash cases
- `totalsByToken` rỗng → strip ẩn, tab Token hiện empty state Vietnamese gọn, không crash.
- Chưa chọn symbol → auto chọn symbol đầu tiên (usd cao nhất) trong `useEffect`.

## Build / Type

```
$ bunx tsgo --noEmit
(exit 0, no output)
```

## Rollback
```bash
rm src/components/statistics/TokenOverviewStrip.tsx \
   src/components/statistics/RankingSegmentedTabs.tsx \
   src/components/benefactors/BenefactorTokenRankingSection.tsx
git checkout src/pages/Benefactors.tsx
```
Không có migration.

## Out of scope (giữ cho sub-phase sau)
- 2.3 USD table gọn lại + drawer.
- 2.4 Ecosystem polish + time-range dedicated.
- 2.5 Export CSV mở rộng.
