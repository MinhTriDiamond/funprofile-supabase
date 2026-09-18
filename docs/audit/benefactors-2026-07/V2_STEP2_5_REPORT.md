# Benefactors v2 — Sub-phase 2.5 Report: Export CSV mở rộng

**Ngày:** 2026-07-03
**Scope:** Mở rộng `ExportCsvDialog` để xuất 3 loại CSV: USD Ranking / Token Ranking / Ecosystem Dimensions.

---

## 1. Thay đổi

### File sửa
- `src/components/benefactors/ExportCsvDialog.tsx` — rewrite hỗ trợ 3 loại export + metadata header + token dropdown hợp nhất USD tokens & ecosystem tokens.
- `src/pages/Benefactors.tsx` — truyền thêm `activeSegment`, `usdTokens`, `currentTokenSymbol`, `currentTimeRange` vào dialog.

### File KHÔNG đổi
- 3 RPC USD (`get_benefactor_leaderboard`, `get_recipient_leaderboard`, `get_donation_global_stats`).
- `useBenefactorLeaderboard`, `useContributionDimensions`, `useTokenLeaderboard`.
- `UsdRankingList/Row`, `TokenOverviewStrip`, `RankingSegmentedTabs`, `ContributionDimensionsPanel`, `StatisticsHero`.
- Unified History, scanner, tokens_registry.

---

## 2. Metadata block chuẩn

Mỗi CSV bắt đầu bằng block metadata `# key: value`, tiếp theo 1 dòng trống, rồi header + data.

**Câu ranking_rule (khớp yêu cầu Cha):**
> Xếp hạng USD chỉ tính token eligible theo tokens_registry, giá trị đã được snapshot/corrected theo policy. FUN và ecosystem dimensions không cộng vào total_usd hiện tại.

CAMLY **không bị loại** khỏi USD Ranking — vẫn được cộng vào `total_usd` nếu eligible sau reprice.

---

## 3. Token dropdown (Token Ranking)

Nguồn hợp nhất, dedup theo symbol uppercase:
1. `usdTokens` — từ `get_donation_global_stats.totals_by_token` (Benefactors truyền xuống).
2. Ecosystem tokens — fetch `get_contribution_dimension_stats(p_dimension:'ecosystem', p_time_range:'all')` lazy khi mở dialog / chọn Token type.

Kết quả: user chọn được **BTC/BNB/USDT/CAMLY/FUN** + mọi ecosystem token.

---

## 4. CSV mẫu

### 4.1 USD Ranking (`benefactors-usd-donors-all-*.csv`)
```
# export_type: usd_ranking
# tab: donors
# time_range: Tất cả
# time_from: null
# time_to: null
# generated_at: 2026-07-03 14:22:11
# ranking_rule: Xếp hạng USD chỉ tính token eligible theo tokens_registry, giá trị đã được snapshot/corrected theo policy. FUN và ecosystem dimensions không cộng vào total_usd hiện tại.
# note: Ecosystem dimensions chỉ mang tính danh dự, không ảnh hưởng USD Ranking.

Rank,Username,Full Name,Coin Totals,Total Donated (USD),Donations Count,Light Score
1,father,Cha Thượng Đế,120 BNB | 50000 CAMLY | 3.5 BTC,325000.00,142,890000
2,funtreasury,FUN Treasury,80 BNB | 25000 USDT,180000.00,88,540000
3,someone,Someone Else,10 BNB | 2000 USDT,12000.00,34,45000
,TOTAL (toàn hệ thống),,210 BNB | 77000 CAMLY | 3.5 BTC | 25000 USDT,517000.00,264,1475000
```

### 4.2 Token Ranking — BTC (`benefactors-token-BTC-sent-all-*.csv`)
```
# export_type: token_ranking
# tab: donors
# direction: sent
# token_symbol: BTC
# time_range: Tất cả
# generated_at: 2026-07-03 14:22:11
# ranking_rule: Xếp hạng USD chỉ tính token eligible theo tokens_registry, giá trị đã được snapshot/corrected theo policy. FUN và ecosystem dimensions không cộng vào total_usd hiện tại.
# note: Token Ranking xếp hạng theo total_amount thô của token. total_amount_usd = 0 nếu token không có giá USD (vd: FUN, testnet, ecosystem).

Rank,Username,Full Name,Token Symbol,Ranking Dimension,Total Amount,Total Amount USD,Tx Count
1,father,Cha Thượng Đế,BTC,usd,3.5,225000.00,12
2,someone,Someone,BTC,usd,0.8,52000.00,3
```

### 4.3 Token Ranking — FUN (`benefactors-token-FUN-sent-all-*.csv`)
```
# export_type: token_ranking
# tab: donors
# direction: sent
# token_symbol: FUN
# time_range: Tất cả
# ...

Rank,Username,Full Name,Token Symbol,Ranking Dimension,Total Amount,Total Amount USD,Tx Count
1,userA,User A,FUN,ecosystem,1250000,0.00,42
2,userB,User B,FUN,ecosystem,890000,0.00,31
```
→ FUN dùng `total_amount` là chính, `total_amount_usd = 0` do FUN không cộng vào USD.

### 4.4 Ecosystem Dimensions (`benefactors-ecosystem-all-*.csv`)
```
# export_type: ecosystem_dimensions
# time_range: Tất cả
# generated_at: 2026-07-03 14:22:11
# ranking_rule: Xếp hạng USD chỉ tính token eligible theo tokens_registry, giá trị đã được snapshot/corrected theo policy. FUN và ecosystem dimensions không cộng vào total_usd hiện tại.
# limit_per_direction_per_token: 20
# note: Ecosystem dimensions không ảnh hưởng USD Ranking. Section top_by_token bị giới hạn để tránh nổ CSV.

# --- section: dimension_stats ---
Token,Dimension,Sent,Received,Tx Count,Unique Participants,Unique Senders,Unique Recipients
FUN,ecosystem,12500000,12500000,842,412,289,203
CAMLY,ecosystem,780000,780000,321,198,145,102

# --- section: top_by_token ---
Token,Direction,Rank,Username,Full Name,Total Amount,Total USD,Tx Count
FUN,sent,1,userA,User A,1250000,0.00,42
FUN,sent,2,userB,User B,890000,0.00,31
...
FUN,received,1,userX,User X,980000,0.00,58
...
CAMLY,sent,1,userY,User Y,120000,180.00,22
...
```

---

## 5. Validation checklist

- [x] `bunx tsgo --noEmit` PASS.
- [x] USD CSV: `father` #1, `funtreasury` #2 (RPC không đổi).
- [x] USD CSV: CAMLY vẫn được tính `total_amount_usd` (không loại).
- [x] Token CSV BTC → father top (RPC `get_token_leaderboard`).
- [x] Token CSV FUN → `total_amount` chính, `total_amount_usd = 0`.
- [x] Ecosystem CSV có 2 section rõ: `# --- section: dimension_stats ---` và `# --- section: top_by_token ---`.
- [x] Ecosystem metadata có `# limit_per_direction_per_token: 20`.
- [x] Token dropdown hợp nhất: BTC/BNB/USDT/CAMLY/FUN + eco tokens, dedup uppercase.
- [x] Không đụng UI Benefactors ngoài truyền props.
- [x] Không import RPC/hook mới ngoài `get_token_leaderboard` + `get_contribution_dimension_stats` đã có.

---

## 6. Out of scope (phase sau)

- Xuất Excel/XLSX (chỉ CSV).
- Custom date range cho Token/Ecosystem (RPC hiện chỉ nhận enum).
- Drawer chi tiết user.
- Bổ sung dimension mới.
