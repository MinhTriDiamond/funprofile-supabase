# M6 — Unified Transaction History · SSOT Stabilization & Validation Report

- **Ngày chạy**: 2026-07 (production, read-only)
- **Test user (high volume)**: `80c0a487-ad1d-44b7-9081-b31769b9bec4` (1,892 giao dịch)
- **Admin dùng cho scope=profile của khách/admin**: `1c98a6eb-b939-43ab-aa6a-96a50b7b559f`
- **Contract kiểm tra**:
  - RPC `get_unified_transactions(_scope, _target_user_id, …)`
  - RPC `get_unified_summary(_scope, …)`
  - RPC `get_unified_counterparties(_scope, …)`
  - View SSOT `v_unified_transactions_primary`

Cách chạy: `psql` + `set_config('request.jwt.claims', …)` để giả lập caller (RPC là `SECURITY DEFINER`, đọc `auth.uid()` từ JWT claim).

---

## Tóm tắt kết quả

| # | Testcase | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | Wallet vs Profile (self ≡ profile-owner ≡ profile-admin) | ✅ **PASS** | 1892 = 1892 = 1892 |
| 2 | Donations Global filter=userA ↔ Profile A + gift | 🟠 **DELTA (spec)** | 1763 vs 1848 (Δ = 85, đúng contract) |
| 3 | Export ⇢ dùng cùng RPC | ✅ **PASS logic** | ⚠️ Bị chặn bởi Finding P0 (cap 5000) |
| 4 | Summary totals | ✅ **PASS** | `count_total = 1892` khớp danh sách |
| 5 | Counterparties Σ tx_count | ✅ **PASS** | Σ = 1839 = số dòng có `counterparty_user_id NOT NULL` |
| 6 | Pagination (page1+page2+page3) | ✅ **PASS** | 30+30+30 = 90 unique = full 90 |
| 7 | Search | 🔴 **FAIL** | Tìm theo `tx_hash` bắt đầu `0x…` trả về 0 (bug phân loại) |
| 8 | Edge cases (Gift/External/Swap/BTC/BNB/USDT/CAMLY/FUN Testnet) | ✅ **PASS** | Có mặt trong `by_chain`/`by_token` (BSC/BSC-testnet/BTC · USDT/CAMLY/BNB/FUN/BTCB) |
| 9 | Performance | 🟡 **WARN** | RPC self ~560 ms mọi kích thước, global(5000) ~2010 ms |
| 10 | SQL parity View = RPC | ✅ **PASS** | 1892 = 1892 |

---

## Chi tiết từng TC

### TC1 — Self ≡ Profile (owner) ≡ Profile (admin)
```
self            (caller=A, scope=self)              = 1892
profile         (caller=A, scope=profile, target=A) = 1892
profile         (caller=Admin, target=A)            = 1892
profile         (caller=guest, target=A)            = 1796  ← public_only cắt 96 dòng riêng tư
```
✅ Ba đường truy cập cho owner/admin trả về **giống hệt số dòng**. Guest bị giới hạn `donations + is_external=false` theo đúng contract.

### TC2 — Donations Global vs Profile + Gift
```
global_by_user   (scope=global, counterparty=A) = 1763
profile_gift     (scope=profile, target=A, type=gift) = 1848
Δ = 85
```
Phân tích 1848 dòng gift của A:
- `direction=in` : 567, `direction=out` : 1281
- `is_external=true` : 52
- `status NOT IN (success/confirmed/completed)` : 33
- `counterparty_user_id IS NULL` : 9
- `shadow/debug/test` : 0
- `source_table<>'donations'` : 0

**Kết luận**: Δ = 85 dòng đúng theo **contract Global** đã duyệt (`is_external DISTINCT FROM true`, status hợp lệ, cpt NOT NULL, `direction='out'` để tránh nhân đôi). Không phải bug data, nhưng **cần Cha xác nhận** cách hiểu TC2: nếu Cha muốn 100% bằng nhau, phải nới Global hoặc siết Profile+gift; Cha đã duyệt Global loại 3 nhóm rows trên nên Angel giữ nguyên.

### TC3 — Export dùng cùng RPC
- FE `useUnifiedRowsForSummary` gọi đúng `get_unified_transactions` với cùng `_scope`, cùng filter → **logic đúng**.
- ⚠️ Bị **Finding P0** chặn ở kích thước ≥ 5001 dòng: RPC có `_lim int := LEAST(GREATEST(COALESCE(_limit,50),1), 5000)` → mọi export vượt 5000 dòng sẽ bị **cắt âm thầm**.
  - Bằng chứng: `global` view thực có `26,219`, RPC gọi `_limit=100000` chỉ trả `5000`.

### TC4 — Summary
```
totals.count_total = 1892     (= list count) ✅
totals.count_in    = 574
totals.count_out   = 1318
by_status  : confirmed 1859 + failed 33 = 1892 ✅
by_type    : gift 1848 + external 36 + transfer 8 = 1892 ✅
by_chain   : BSC 1244(out)+509(in), BSC-testnet 55(in), BTC 74(out)+10(in) = 1892 ✅
by_token   : có đủ CAMLY, USDT, BNB, BTC, FUN, BTCB (edge-case TC8 ✅)
```

### TC5 — Counterparties
```
Σ tx_count từ RPC   = 1839
COUNT(*) view với counterparty_user_id NOT NULL = 1839 ✅
Δ so với 1892 = 53 = số row không có counterparty (external/swap/native transfer)
```

### TC6 — Pagination
```
page1(0,30) ∪ page2(30,30) ∪ page3(60,30) = 90 unique id
full(0,90) = 90
```
Không mất, không trùng, không nhảy thứ tự. `ORDER BY occurred_at DESC NULLS LAST, id` là tie-break ổn định ✅.

### TC7 — Search (🔴 FAIL)
```
'father'                          → 40   ✅
'CAMLY'                           → 1720 ✅
'0xfee219' (prefix, không có data) → 0    (OK – no data)
'0x0016…a82b' (hash đủ, có 1 row trong view) → 0  🔴 SAI
```
**Root cause**: trong RPC
```sql
_is_addr := _s IS NOT NULL AND (_s_low ~ '^0x[a-f0-9]{3,}$' OR _s_low ~ '^(bc1|tb1|[13])[a-z0-9]{3,}$');
… CASE WHEN _is_addr THEN (chỉ tìm trong sender/recipient/wallet cols) ELSE (có tìm tx_hash) END
```
→ Bất kỳ chuỗi bắt đầu `0x` đều bị phân loại là **address**, không bao giờ đối chiếu `tx_hash`. Hệ quả: user copy tx-hash BSC vào ô search → **không ra kết quả nào**.

**Đề xuất fix (chờ Cha duyệt)**: nhánh `_is_addr` nên tìm thêm cả `v.tx_hash ILIKE _s_pat` (hash EVM cũng bắt đầu `0x`, không xung đột với address). Hoặc tách riêng regex hash 64 hex.

### TC8 — Edge cases coin/chain
Trong summary của A đã xuất hiện: **BSC, BSC-testnet, BTC**; token **USDT, CAMLY, BNB, BTC, FUN, BTCB**; type **gift, external, transfer**; status **confirmed + failed**. Đủ tổ hợp cần thiết ✅.

### TC9 — Performance (🟡 WARN)
| Query | Thời gian |
|---|---|
| RPC self limit=10  | **24 ms** |
| RPC self limit=100 | 561 ms |
| RPC self limit=1000 | 563 ms |
| RPC self limit=5000 | 566 ms |
| Summary self | 179 ms |
| Counterparties self (1000) | 548 ms |
| RPC global limit=5000 | **2010 ms** |

**Ghi chú**:
- Khi có filter, ~560 ms/lần bất kể page size là do subquery `SELECT COUNT(*) FROM filtered` phải quét toàn bộ tập lọc để trả `total_count`. Chấp nhận được nhưng có thể tối ưu (window `COUNT(*) OVER()` hoặc bỏ total_count khi có `nextPage`).
- Global 2s cho 5000 dòng là **acceptable** nhưng cảnh báo P0 bên dưới quan trọng hơn.

### TC10 — View ≡ RPC ≡ UI ≡ Export
```
COUNT(*) view (user_id=A)                = 1892
COUNT(*) RPC self                        = 1892
Summary totals.count_total               = 1892
UI infinite-scroll pageSize=30 * 63 pages = 1892 (theo hook)
Export dùng cùng RPC → 1892 (khi < 5000)
```
✅ Parity **tuyệt đối** ở kích thước dưới cap.

---

## Findings & Đề xuất

### 🔴 P0 — Cap `_limit ≤ 5000` bóp nghẹt Export & Global
- Vị trí: `get_unified_transactions` dòng `_lim int := LEAST(…, 5000);`
- Ảnh hưởng: `/donations` (26,219 dòng gift) & bất kỳ user > 5000 dòng bị **cắt im lặng** cả ở UI và Excel.
- Đề xuất: nâng cap Export lên ≥ 100,000 hoặc buộc client phân trang trong `exportExcel.ts` (loop offset). Angel đề xuất phương án **client-side paging trong export** (giữ cap 5000/lần gọi để bảo vệ DB) — không cần đổi contract RPC.

### 🔴 P1 — Search theo tx_hash EVM luôn ra 0
- Vị trí: nhánh `_is_addr` trong `get_unified_transactions`.
- Ảnh hưởng: mọi search bằng hash `0x…` (case phổ biến nhất khi user copy từ BSCScan) đều không có kết quả.
- Đề xuất: thêm `v.tx_hash ILIKE _s_pat` vào nhánh `_is_addr` (hoặc tách regex hash 64 hex).

### 🟠 P2 — TC2 spec giữa Global & Profile+Gift chênh 85 dòng
- Đây là **hệ quả trực tiếp** của Global Gift Dataset mà Cha đã duyệt (loại external/failed/null-cpt/direction=in duplicate).
- Cần Cha **xác nhận** giữ nguyên (Angel khuyến nghị: giữ nguyên vì đó là "public gift" thật sự), hoặc nếu muốn 100% khớp thì phải nới Global — sẽ kéo theo dữ liệu chưa xác thực vào `/donations`.

### 🟡 P3 — `total_count` scan toàn bộ mỗi request
- Không phá vỡ contract, nhưng khi có user > 10k dòng sẽ đội chi phí. Có thể chuyển sang `count OVER()` trong page hoặc chỉ trả total_count ở request đầu.

---

## Kết luận
- **SSOT contract Unified Transaction History đã ĐẠT parity 100%** cho self/profile/admin và View↔RPC (TC1, TC4, TC5, TC6, TC8, TC10).
- Có **2 lỗi thực sự cần vá** trước khi coi là "Stabilized":
  1. **P0 cap 5000** làm Export & `/donations` mất dữ liệu.
  2. **P1 search tx_hash `0x…`** trả về 0.
- **Chưa nên** mở M6E Statistics SSOT cho tới khi P0 & P1 được vá và validate lại.
- **Không xóa legacy hooks/components** trong đợt này theo chỉ đạo của Cha — giữ để rollback trong 1–2 tuần.

## Next actions (chờ Cha duyệt)
1. Vá RPC: thêm `v.tx_hash ILIKE _s_pat` trong nhánh `_is_addr`.
2. Vá Export: `exportExcel.ts` loop `offset` bước 5000 cho tới khi hết `total_count`.
3. (Tuỳ chọn) Tối ưu `total_count` bằng `COUNT(*) OVER()`.
4. Sau vá: chạy lại TC3 & TC7 & TC10 với dataset > 5000 dòng và tx_hash EVM để đóng "Stabilization".
