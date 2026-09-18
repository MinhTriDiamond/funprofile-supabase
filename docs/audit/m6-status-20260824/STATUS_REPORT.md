# M6B / M6D / M6E — Báo cáo trạng thái THẬT (24/08/2026)

Mọi số liệu dưới đây được chạy lại trong phiên này. Mục nào không chạy được ghi rõ **CHƯA VERIFY**.

---

## 1. M6B — PRODUCER CLEANUP

### 1.1 Gap giữa `transactions` và `v_unified_transactions`

**Bằng chứng raw**

```
select count(*) from transactions;                      -> 63425
select source_table, count(*) from v_unified_transactions group by 1;
   source_table    | count
-------------------+-------
 donations         | 62029
 wallet_transfers  |  3414
 transactions      |  1108
 swap_transactions |    92

select token_symbol, chain_id, count(*) from v_unified_transactions
 where source_table='transactions' group by 1,2;
 USDT | 56 | 628
 BNB  | 56 | 445
 BTC  | 0  |  35

-- rows whitelist (BTC/0, BNB|USDT/56) trong bảng gốc
whitelist_rows_in_transactions = 16623
whitelist_missing_from_view    = 15515   (phần lớn bị dedup vì có donations cùng tx_hash)

-- gap THẬT (whitelist, không có donations đối ứng cùng tx_hash)
true_gap = 295
```

Query gap toàn token (loại cả `wallet_transfers`) bị `statement timeout` 2 lần ⇒ **CHƯA VERIFY**.

**Diễn giải**
- Con số "~29 gap rows" của báo cáo cũ **KHÔNG tái lập được**. Hiện tại gap thật ở nhóm whitelist là **295 dòng**, tăng so với báo cáo cũ.
- Nguyên nhân khả năng cao: view dùng **whitelist cứng** (BTC/chain 0, BNB/USDT chain 56) + dedup theo `tx_hash`; scanner tiếp tục ghi thêm row vào `transactions` sau ngày apply M6B-1 (01/07), trong đó có row không có donations đối ứng ⇒ gap tăng dần theo thời gian. Đây là **gap sống**, không phải one-off.
- So mốc M6B-1: nhánh `transactions` trong view khi apply là 590 dòng, nay **1108** ⇒ view vẫn nhận row mới, nhưng không phủ hết.

### 1.2 Định nghĩa view

**Bằng chứng raw** (`pg_get_viewdef('public.v_unified_transactions')`, 418 dòng — trích cấu trúc CTE)

```
WITH don_out AS ( ... 'donations'::text AS source_table ... FROM donations d
), don_in AS ( ... 'donations' ... FROM donations d
), wt AS      ( ... 'wallet_transfers' ... FROM wallet_transfers w
), tx AS      ( ... 'transactions' ... FROM transactions t     <-- nhánh transactions ĐÃ CÓ
), sw AS      ( ... 'swap_transactions' ...
```

Nhánh `tx` gán `tx_type='transfer'`, `is_external=false`, direction suy ra bằng so `from_address/to_address` với `profiles.public_wallet_address` / `profiles.btc_address`.

**Diễn giải** — UNION cho `transactions` **đã có thật** (M6B-1 đúng). Nhưng: `is_external` hardcode `false` và `direction` có thể ra `'unknown'` khi địa chỉ không khớp profile ⇒ rủi ro hiển thị sai hướng cho row reconciliation.

### 1.3 Edge `record-swap`

**Bằng chứng raw**

```
ls supabase/functions | grep -i swap
backfill-swap-transactions
record-swap
swap-quote
```

Grep tên cụ thể `record-swap`:
```
supabase/functions/record-swap/index.ts:1
supabase/functions/record-swap/index.ts:127   verified_by: verified ? 'edge:record-swap' : 'edge:pending-verify'
supabase/functions/record-swap/validateSwapInput.ts:2
src/components/wallet/SwapTab.tsx:193  // Gọi edge record-swap (idempotent + verify on-chain).
src/components/wallet/SwapTab.tsx:197  supabase.functions.invoke('record-swap', { ... })
src/components/wallet/SwapTab.tsx:213  console.warn('[SwapTab] record-swap thất bại, sẽ đồng bộ lại sau:', recordErr)
src/__tests__/record-swap-input-guard.test.ts, src/__tests__/swap-price-validation.test.ts
```

Nội dung function: `requireUser` → `validateSwapInput` (BigInt string) → idempotent check `swap_transactions(tx_hash, chain_id)` → verify Moralis (`receipt_status`, `from_address` vs `profiles.public_wallet_address`) → insert với `verified_by = 'edge:record-swap' | 'edge:pending-verify'`.

**Diễn giải** — **ĐÃ TỒN TẠI và ĐANG ĐƯỢC GỌI THẬT** từ `SwapTab.tsx:197`. Lưu ý: lỗi ghi chỉ `console.warn` ⇒ nếu edge fail, swap on-chain vẫn thành công mà không có row (M6D-relevant).

### 1.4 Atomic upsert reconciliation

**Bằng chứng raw** (`supabase/functions/wallet-reconciliation-cron/index.ts:70–83`)

```ts
// Helper: insert nếu chưa có (idempotent qua check truớc, không dùng ON CONFLICT vì
// PostgREST không nhận diện partial unique index).
const insertTxIfMissing = async (row: any) => {
  const { data: exist } = await supabase.from("transactions").select("id")
    .eq("tx_hash", row.tx_hash).eq("user_id", row.user_id)
    .eq("from_address", row.from_address).eq("to_address", row.to_address).maybeSingle();
  if (exist) return { skipped: true, error: null };
  const { error } = await supabase.from("transactions").insert(row);
  if (error && error.code === "23505") return { skipped: true, error: null }; // race → unique index chặn
  return { skipped: false, error };
};
```

**Diễn giải** — **KHÔNG phải atomic upsert**. Vẫn là check-before-insert; chỉ có lớp phòng hộ bắt `23505` từ unique index. Nghĩa là TD-10 được **giảm nhẹ**, chưa đóng đúng như spec (`ON CONFLICT DO NOTHING`).

### 1.5 Vitest guard cho view

**Bằng chứng raw**

```
rg -ln "v_unified" src/__tests__ supabase/functions   -> (không có kết quả)
ls src/__tests__ | rg -i "unified|view|m6"            -> (không có kết quả)
```

Test liên quan gần nhất đã chạy thật:
```
bunx vitest run src/__tests__/record-swap-input-guard.test.ts src/__tests__/swap-price-validation.test.ts src/hooks/adapters/__tests__/unifiedToDonation.test.ts

✓ src/__tests__/record-swap-input-guard.test.ts (18 tests) 11ms
✓ src/__tests__/swap-price-validation.test.ts (11 tests) 7ms
✓ src/hooks/adapters/__tests__/unifiedToDonation.test.ts (6 tests) 10ms
Test Files  3 passed (3)
Tests  35 passed (35)
```

**Diễn giải** — **KHÔNG TỒN TẠI vitest guard nào cho `v_unified_transactions`**. Nhãn "CI pass" trong báo cáo cũ chỉ đúng cho test swap/adapter, không bảo vệ định nghĩa view. Đây là lý do gap 295 dòng trượt qua mà không ai phát hiện.

### 1.6 4 dòng CAMLY backfill

**Bằng chứng raw** — grep toàn bộ `docs/audit/m6b-*`, `m6d-*`: không có mục nào ghi "4 dòng CAMLY backfill" (chỉ có 8 dòng CAMLY trong `sample_removed_dup_with_donations.txt` là mẫu dedup, và "9 dòng CAMLY sai giá" thuộc audit benefactors-2026-07).

**Diễn giải** — **CHƯA VERIFY**: không xác định được 4 donation_id cụ thể để query lại. Cần Cha/CTO cấp 4 ID hoặc tx_hash.

---

## 2. M6D — STATISTICS DEEP AUDIT

### 2.1 Dashboard Statistics có gồm swap chưa

**Bằng chứng raw**

```
get_unified_admin_stats(...)  ->  FROM public.v_unified_transactions_primary v
get_unified_summary(...)      ->  FROM public.get_unified_transactions(...)  (đọc _primary)
get_unified_transaction_detail-> FROM public.v_unified_transactions   (raw view)

select tx_type, count(*) from v_unified_transactions group by 1;
 gift     | 62029
 external |  3414
 transfer |  1108
 swap     |    92
```

**Diễn giải** — **CÓ**, swap đã vào view (92 leg = 46 swap × 2). Nhưng `get_unified_transaction_detail` vẫn đọc **raw view** thay vì `_primary` — đúng như M6D đã cảnh báo, **chưa migrate**.

### 2.2 Treasury — case cụ thể (CAMLY, 30 ngày)

**Bằng chứng raw**

```
-- Nguồn UI (edge treasury-overview: pet_shop_orders + mystery_box_orders, status=confirmed)
 pet_shop_orders    | 0 |  (null)
 mystery_box_orders | 7 | 334000

-- treasury_flows (30 ngày)
 flow_type        | source         | count | sum
 epoch_allocation | epoch_snapshot |     5 | 15000000

-- treasury_vaults
 community_growth    |  6000000 | inflow  6000000 | outflow 0 | 2026-08-01
 infrastructure      |  8000000 | inflow  8000000 | outflow 0 | 2026-08-01
 reward_reserve      | 30000000 | inflow 30000000 | outflow 0 | 2026-08-01
 stability           |  6000000 | inflow  6000000 | outflow 0 | 2026-08-01
 strategic_expansion | 10000000 | inflow 10000000 | outflow 0 | 2026-08-01
```

**Diễn giải** — **2 hệ đo LỆCH NHAU VỀ BẢN CHẤT**: UI Treasury (admin) đo **CAMLY** từ orders + balance on-chain; `treasury_flows`/`treasury_vaults` đo **FUN** từ epoch allocation. Không có cột `token_symbol` trong 2 bảng này ⇒ không thể đối chiếu trực tiếp cùng token. 334.000 CAMLY inflow 30 ngày **không xuất hiện** ở `treasury_flows`. Đây là lỗ hổng SSOT treasury cần chốt trước M6E.

### 2.3 Export PDF

**Bằng chứng raw**

```
src/utils/export/index.ts:2  * Entry export utils — Excel duy nhất.
src/utils/export/index.ts:3  * PDF đã bị loại bỏ để giảm technical debt.
src/utils/export/mapRows.ts:30  export function mapDonationsToRows(...)
src/utils/export/mapRows.ts:95  export function mapClaimsToRows(...)
```

**Diễn giải** — **Export PDF không còn tồn tại** ⇒ câu hỏi "PDF phản ánh đúng sau M6B chưa" không áp dụng. Nhưng phát hiện quan trọng: export Excel vẫn map từ **`donations` + `claims`**, **không** đọc `v_unified_*` ⇒ số liệu export **KHÔNG hưởng fix M6B** (thiếu reconciliation/claim/swap). So sánh trước/sau: **CHƯA VERIFY** (không có snapshot export cũ để đối chiếu).

### 2.4 Notification số dư/giao dịch

**Bằng chứng raw** — `rg -n "amount|balance" src/services/notificationService.ts` → không có kết quả.

**Diễn giải** — Notification không tự tính số dư/tổng tiền (chỉ chuyển tiếp payload). **Không có đối chiếu nào cần làm**; nhưng chưa rà các edge tự insert notifications có nhúng số tiền ⇒ phần đó **CHƯA VERIFY**.

---

## 3. M6E — SSOT (CHỈ AUDIT, KHÔNG SỬA)

### 3.1 Các nguồn tính USD pricing đang tồn tại

**Bằng chứng raw** (grep `price_usd|amount_usd|FALLBACK_PRICES|usdValue|priceMap`)

| # | Nguồn | File | Loại |
|---|---|---|---|
| 1 | `useTokenPrices` (edge `token-prices`) | `src/hooks/useTokenPrices.ts` | market, client |
| 2 | `FALLBACK_PRICES` **hardcode** (BNB 700, BTC/BTCB 100.000, CAMLY 0,000014, ETH 3500, POL 0,5, TON 5) | `src/hooks/useTokenPrices.ts:14-24` | hardcode, client |
| 3 | `useCamlyPrice` (wrapper của #1 + #2) | `src/hooks/useCamlyPrice.ts` | client |
| 4 | `priceMap` override BTC→BTCB / BNB→WBNB | `src/components/feed/GlobalGiftStatsModal.tsx` | client |
| 5 | `usd_value = amount × price` | `src/hooks/useGiftBreakdown.ts` | client |
| 6 | `usdValue` per token + `totalUsdValue` | `src/hooks/useTokenBalances.ts:201` | client |
| 7 | `donations.amount_usd` / `price_usd_at_donation` (trigger `donations_set_usd_default`) | `src/lib/donationPriceValidation.ts` (mirror) | server, snapshot |
| 8 | Swap USD do client khai + validate log-only | `src/lib/swapPriceValidation.ts`, `supabase/functions/record-swap` | server, log-only |
| 9 | `token_price_history` + edge `token-price-at-time` | `supabase/functions/token-price-at-time/index.ts` | server, historical |
| 10 | RPC `get_benefactor_leaderboard` / `get_recipient_leaderboard` / `get_donation_global_stats` (SUM `amount_usd`) | DB | server |
| 11 | `get_unified_admin_stats` / `get_unified_summary` (đọc `_primary`) | DB | server |

**Diễn giải** — Thực tế là **11 nguồn**, nhiều hơn con số 9 trong mục tiêu cũ. Nguồn #2 (hardcode BTC $100k) **vẫn còn trong code** dù Phần A trước đó yêu cầu bỏ fallback hardcode ⇒ nhãn "đã bỏ fallback" chỉ áp cho phía DB trigger, **không** áp cho FE.

### 3.2 Các implementation SUM song song theo token

**CLIENT-SIDE (ứng viên xoá)**
```
src/hooks/useTokenBalances.ts:201     tokens.reduce((sum,t)=>sum+t.usdValue,0)
src/hooks/useGiftBreakdown.ts:122-123 items.reduce((s,i)=>s+i.usd_value,0) / count
src/components/feed/GlobalGiftStatsModal.tsx:123 aggregated.reduce((s,r)=>s+r.usd,0)
src/hooks/useBenefactorLeaderboard.ts:76  Object.values(totals_by_token).reduce(...)  // total_donated
src/hooks/useBenefactorLeaderboard.ts:111 Object.values(totals_by_token).reduce(...)  // total_received
src/utils/export/mapRows.ts:30/95      mapDonationsToRows / mapClaimsToRows (map + tổng phía client, nguồn donations/claims)
```

**SERVER-SIDE (ứng viên giữ làm SSOT)**
```
get_unified_admin_stats     -> v_unified_transactions_primary  (by_token, totals)
get_unified_summary         -> get_unified_transactions        (by_token/by_chain/by_type/by_status)
get_unified_facets, get_unified_counterparties
get_benefactor_leaderboard / get_recipient_leaderboard / get_donation_global_stats -> donations.amount_usd
token_price_history (giá lịch sử)
```

Ghi chú token cụ thể:
- **FUN**: `testnet_skip`, `amount_usd = NULL` (server). FE không có SUM riêng cho FUN USD.
- **CAMLY**: có cả hardcode FE (#2) và snapshot server ⇒ nguồn outlier lịch sử.
- **BTC**: hardcode FE $100.000 + `price_usd_at_donation` server ⇒ **2 nguồn xung đột**.

**KHÔNG sửa/xoá gì** ở bước này, đúng yêu cầu. Chờ CTO duyệt phương án gộp.

---

## 4. Phát hiện phụ (liên quan toàn vẹn dữ liệu tài chính, KHÔNG tự xử lý)

1. **Gap `transactions` là gap sống** (295 dòng whitelist), sẽ tăng tiếp vì không có test/cron canh view.
2. **Không có vitest/DB guard nào cho `v_unified_transactions`** ⇒ mọi hồi quy view im lặng.
3. **Export Excel không đọc unified view** — vẫn map từ `donations`/`claims`, nên mọi số liệu export lệch với UI History sau M6B.
4. **`record-swap` fail chỉ `console.warn`** ở `SwapTab.tsx:213` ⇒ swap on-chain có thể mất row.
5. **`v_unified_transactions.tx` hardcode `is_external = false`** và direction có thể `'unknown'`.
6. **`treasury_flows`/`treasury_vaults` không có `token_symbol`** ⇒ CAMLY inflow (334.000/30 ngày) không được ghi sổ treasury.
7. **`FALLBACK_PRICES` hardcode BTC $100.000 vẫn còn ở FE** dù policy đã yêu cầu loại bỏ.
8. **`get_unified_transaction_detail` còn đọc raw view** (chưa migrate sang `_primary`).
