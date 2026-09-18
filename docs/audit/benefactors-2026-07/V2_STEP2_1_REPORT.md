# Benefactors v2 — Sub-phase 2.1 Report
**Statistics Header Foundation**

Date: 2026-07-02
Scope: Tạo `StatisticsHero` generic + `StatisticCard` + `BenefactorRuleBanner`, refactor Benefactors chỉ consume bằng props.

---

## 1. Deliverables

| File | Purpose |
|------|---------|
| `src/components/statistics/types.ts` | Shared types (`StatisticMetric`, `SemanticColor`, `TrendInfo`) |
| `src/components/statistics/StatisticCard.tsx` | 1 KPI card generic, semantic tokens only |
| `src/components/statistics/StatisticsHero.tsx` | Header + KPI grid + info banner slot, không biết đến Benefactor/Donation |
| `src/components/benefactors/BenefactorRuleBanner.tsx` | Info banner riêng cho Benefactors (nằm ngoài statistics/) |
| `src/pages/Benefactors.tsx` | Refactor: bỏ header + stats cũ, chỉ truyền props vào `<StatisticsHero />` |

## 2. Grep proofs (bắt buộc PASS)

File: `evidence/v2_step2_1_grep.txt`

```
=== Grep 1: forbidden literals in statistics/ ===
(no matches — PASS)

=== Grep 2: forbidden imports in statistics/ ===
(no matches — PASS)
```

- `src/components/statistics/` không chứa literal `Benefactor`, `Donation`, `FUN`, `Mạnh Thường Quân`.
- `src/components/statistics/` không import từ `components/benefactors`, `hooks/useDonation`, `hooks/useBenefactorLeaderboard`.

## 3. KPI data proof

`get_donation_global_stats('all')`:

| Metric | Value | Displayed |
|---|---|---|
| total_donated_usd | 1,642,080.23 | `$1.64M` |
| total_donors | 402 | `402` |
| total_recipients | 865 | `865` |
| total_donations | 24,866 | `24.9K` |

FE hero đọc trực tiếp từ RPC hiện có, không aggregate thêm.

## 4. Screenshots

- `evidence/desktop.png` — 1280×900: 4 KPI card grid ngang, banner rule đầy đủ.
- `evidence/tablet.png` — 900×1200: 2×2 grid.
- `evidence/mobile.png` — 390×800: snap scroll ngang, card đầu tiên hiển thị đầy đủ `$1.64M`.

## 5. Regression validation

- **USD Ranking:** father `$1,046,470.78` #1, funtreasury `$97,023.71` #2 — không đổi (thấy trực tiếp trong desktop screenshot).
- **ContributionDimensionsPanel:** vẫn được render (import + usage giữ nguyên ở dòng cuối `<main>`).
- **3 RPC USD:** không sửa (`get_benefactor_leaderboard`, `get_recipient_leaderboard`, `get_donation_global_stats`).
- **Unified History / scanner / tokens_registry:** không đụng.

## 6. Architecture note

`StatisticsHero` là generic foundation, dùng chung cho Treasury / Wallet / History / Marketplace / Academy / Dashboard sau này. API:

```ts
<StatisticsHero
  title="..."
  subtitle="..."
  icon={<Icon />}
  metrics={StatisticMetric[]}   // đã format sẵn
  infoBanner={<AnyBanner />}
  actions={<AnyActions />}
/>
```

Consumer chỉ cần build `metrics[]` từ data source của mình. Không có coupling ngược từ `statistics/` sang bất kỳ domain component nào.

## 7. Build / typecheck

- `tsgo`: PASS (không lỗi TS sau refactor).
- Vite build: PASS.

## 8. Rollback

```bash
rm -r src/components/statistics
rm src/components/benefactors/BenefactorRuleBanner.tsx
git checkout src/pages/Benefactors.tsx
```

Không có migration ⇒ không có rollback DB.
