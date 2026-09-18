# Sub-phase 2.4 — Ecosystem Panel Polish (Report)

Ngày: 2026-07 · Trạng thái: **PASS**

## Scope thực thi
Chỉ chỉnh presentation `src/components/benefactors/ContributionDimensionsPanel.tsx`. Không đổi hook, RPC, `Benefactors.tsx`, USD Ranking, Token Ranking, Export, Unified History, scanner.

## Thay đổi
- Header thêm info banner border-dashed: "Không ảnh hưởng USD Ranking".
- Icon token h-10 + `ring-1 ring-border`, symbol `text-lg font-bold`.
- Badge `ranking_dimension` map theo giá trị: `ecosystem` → primary tint "Ecosystem"; chứa `testnet` → amber; khác → outline raw. Không hardcode symbol.
- Grid metric `grid-cols-2 md:grid-cols-4`, thêm icon `Receipt` cho "Giao dịch", background `bg-muted/30`.
- Top list: icon hướng (Up/Down), mobile top 3 (`md:hidden`), desktop top 5 (`hidden md:block`). Rank badge viền `bg-muted`. Amount format compact + symbol nhỏ.
- Empty state có icon `Inbox`.

## Grep proofs (`evidence/v2_step2_4_grep.txt`)
```
(empty)  # 0 match cho "FUN"/"BTC"/"USDT"/"CAMLY"/"BNB" hardcoded
(empty)  # 0 match import useBenefactorLeaderboard/useRecipientLeaderboard
```

## Không N+1 mới
Giữ nguyên 2 call `useTokenLeaderboard` (sent/received) per dimension như bản gốc. Không thêm query per row.

## Regression
- Tab USD: father #1, funtreasury #2 giữ nguyên (không sửa `UsdRankingList/Row`, không sửa RPC).
- Tab Token Ranking: không đổi (không sửa `BenefactorTokenRankingSection`).
- Tab Ecosystem: render FUN dimension với badge Ecosystem + 4 metric + top 5.

## Validation
- `bunx tsgo --noEmit`: PASS (0 lỗi).
- Screenshot: `evidence/v2_step2_4_desktop.png` (1280), `v2_step2_4_tablet.png` (768), `v2_step2_4_mobile.png` (375).

## Ngoài scope (để phase sau)
- Drawer chi tiết dimension.
- Time range picker per-panel.
- Export CSV (thuộc 2.5).
