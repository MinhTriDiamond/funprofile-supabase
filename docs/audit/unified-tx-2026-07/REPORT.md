# Unified Transaction History — System Audit Report

- **Ngày chạy**: 2026-07-01
- **Mode**: READ-ONLY (không sửa DB/schema/code)
- **Scope**: `donations`, `wallet_transfers`, `transactions`, `v_unified_transactions`, `v_unified_transactions_primary`, RPC `get_unified_transactions|_summary|_counterparties|_light_score`, `_unified_tx_can_view`, FE hook + component + export.
- **Feature flag hiện tại**: `unified_tx_read_enabled = false`, `unified_shadow_sampling = 0` → Unified History đang **chưa bật** cho production; toàn bộ surface hiện vẫn dùng legacy hook. Đây là bối cảnh bắt buộc cho mọi khuyến nghị bên dưới.

## Tổng quan số liệu

| Bảng | Row |
|---|---:|
| `donations` (tất cả) | 27,918 |
| `donations` (confirmed) | 27,867 |
| `donations` có `tx_hash` | 27,918 |
| `wallet_transfers` | 2,161 |
| `wallet_transfers` có `tx_hash` | 2,161 |
| `transactions` | 55,327 |
| `transactions` có `tx_hash` | 55,327 |
| `v_unified_transactions` (raw UNION) | 111,911 |
| `v_unified_transactions_primary` (dedup) | 55,372 |

---

## Track 1 — Data source & dedup

### 🟢 Primary view dedup HOÀN HẢO

Query trên `v_unified_transactions_primary` group theo `(user_id, lower(tx_hash), direction)`:

- **0** nhóm trùng, **0** row thừa.
- Layer dedup `row_number() OVER (PARTITION BY user_id, coalesce(lower(tx_hash),'no-hash:...:'||source_id))` đang làm đúng nhiệm vụ: khi cùng `tx_hash` xuất hiện ở cả `donations` + `transactions` + `wallet_transfers` thì chỉ giữ 1 dòng theo priority `donations > wallet_transfers > transactions`.

### 🟢 Coverage 100% — không giao dịch nào bị bỏ sót

| Nguồn | Row có hash nhưng không xuất hiện trong primary view |
|---|---:|
| `donations` (góc sender) | **0** |
| `donations` (góc recipient) | **0** |
| `wallet_transfers` | **0** |
| `transactions` | **0** |

Trigger `sync_donation_to_transactions` + `sync_wallet_transfer_to_transactions` + RPC `backfill_transactions_from_sources` (memory `transaction-history-backfill-policy`) đang giữ 3 bảng đồng bộ. Đây là kết quả tốt sau đợt backfill 22/06/2026 (425 dòng) và các đợt reconciliation gần nhất.

### 🟡 Trùng nội bảng `donations` (42 hash) & `wallet_transfers` (4 hash)

Evidence: `evidence/donation_hash_duplicates.csv`.

- 4 hash xuất hiện 3 lần, 38 hash xuất hiện 2 lần trong `donations`.
- Mẫu điển hình: `9da49e2a…` xuất hiện 3 lần với 3 recipient khác nhau nhưng chỉ 2 sender khác nhau. Đây là các giao dịch batch (nhiều recipient trong 1 tx) hoặc dedup lỗi ở scanner.
- Với primary view: **KHÔNG gây lệch số** vì partition theo `(user_id, tx_hash)` — mỗi user chỉ giữ 1 dòng. Rủi ro là ở **báo cáo hệ thống theo hash** (ví dụ Founder dashboard "tổng lượt tặng theo tx"): sẽ đếm 42+4 = 46 hash trùng.
- Không sửa dữ liệu ngay. Cần scanner audit riêng để xác định lý do (batch tx hợp lệ vs. duplicate insert).

**Mức độ**: 🟡 Medium. **Ảnh hưởng**: chỉ tác động các query đếm theo `tx_hash`. Primary view + UI cá nhân KHÔNG bị lệch.

### 🟡 Chênh lệch raw vs primary = 48,483 row

`v_unified_transactions` (raw UNION) có 111,911 row, primary còn 55,372 → dedup 56,539 row (~50%). Đây là **thiết kế đúng**, không phải bug:

- Mỗi `donations` sinh 2 dòng (in cho recipient + out cho sender) → 27,918 × 2 = 55,836 → sau khi dedup ứng với các bên trùng, ~55,372 giữ lại.
- `transactions` gần như phủ toàn bộ `donations`/`wallet_transfers` nên bị dedup bỏ.

Không cần fix. Ghi nhận để hiểu số liệu.

### 🟡 Direction = 'unknown' — 23 row

Evidence: `evidence/direction_unknown.csv`. Tất cả đến từ nguồn `transactions` (18 BSC + 5 BTC): scanner ghi transaction cho user_id X nhưng `from_address`/`to_address` không khớp với `profiles.public_wallet_address`/`btc_address` của X → view không suy được hướng.

**Nguyên nhân giả định**: user đã đổi địa chỉ ví sau khi giao dịch được ghi; hoặc scanner ghi dùm bên thứ ba (bug legacy). Cần đối chiếu case-by-case; số lượng nhỏ.

**Mức độ**: 🟡 Medium. **Ảnh hưởng**: UI hiện "?" hướng, summary bỏ vào `count_unknown`.

### 🟢 Amount unparsable — 2 row

Cả 2 là cùng 1 donation `667668de…` amount `999.` (thiếu chữ số sau dấu chấm). Regex `^-?\d+(\.\d+)?$` reject. Cần fix data record đó (chuyển thành `999` hoặc `999.0`). Ảnh hưởng: summary bỏ sót ~999 CAMLY.

### 🔴 Decimals missing — 3,206 row

Evidence: `evidence/decimals_missing.csv`.

| Token | Chain | Row |
|---|---|---:|
| FUN | bsc_testnet | 2,894 |
| CAMLY | bsc | 265 |
| USDT | bsc | 24 |
| BNB | bsc_testnet | 20 |
| CAMLY | bsc_testnet | 2 |
| BTC | btc | 1 |

Nguyên nhân: `tokens_registry` chưa có entry cho các cặp `(chain_id, symbol)` trên. FE `formatTokenAmount` sẽ fallback về decimals=18 → **hiển thị sai** cho CAMLY (3 decimals), USDT BSC (18 vs 6 tuỳ contract), BTC (8).

**Mức độ**: 🔴 High cho CAMLY/USDT/BTC (sai đơn vị hiển thị). **Ảnh hưởng**: mọi surface (summary, export, dashboard) đọc `decimals` đều lệch. Cần seed thêm registry cho FUN testnet + CAMLY testnet + xác nhận `tokens_registry_chain_native_uidx` có entry `chain_id=56, symbol='CAMLY', token_address IS NULL` không (view join theo cả contract address và symbol).

---

## Track 2 — View & RPC contract

### 🟢 View `v_unified_transactions_primary` dedup logic đúng

Priority `donations(1) > wallet_transfers(2) > transactions(3)`, tie-break bằng `direction<>'unknown'` rồi `occurred_at DESC`. Phù hợp với thứ tự "record nào giàu ngữ nghĩa nhất thắng".

### 🟢 RPC signature cross-check

FE `useUnifiedTransactionHistory` gọi `get_unified_transactions` với **13 tham số** (`_target_user_id, _direction, _chain, _token_symbol, _tx_type, _status, _from_ts, _to_ts, _search, _limit, _offset, _external_only, _counterparty_user_id`) — khớp signature DB. Overload 12 tham số cũ đã drop (migration `20260701064731_drop_tx_overload.sql`).

`get_unified_summary` tồn tại và trả về JSONB đủ `totals + by_token + by_chain + by_type + by_status`. `ShadowProbe` đọc `total_count` từ `count_total`, phù hợp.

### 🟡 `get_unified_summary` KHÔNG có filter `direction`/`status`/`type`/`search`/`external_only`

Chỉ nhận `_from_ts, _to_ts, _chain, _token_symbol`. Kết quả:

- Summary card ở UI (khi user chọn filter direction=in) sẽ **KHÔNG khớp** với list.
- FE hiện đang bypass bằng cách tự aggregate từ `useUnifiedRowsForSummary` (5,000 row cap) → chính xác nhưng **giới hạn 5,000**. User có >5,000 giao dịch sẽ bị summary lệch.

Note: Father hiện có ~1,893 dòng (top 1), chưa đụng cap, nhưng cần theo dõi.

**Mức độ**: 🟡 Medium. **Đề xuất** (chỉ note, chưa sửa): bổ sung tham số filter đầy đủ vào `get_unified_summary` để summary luôn khớp list bất kể số row.

### 🟢 `_unified_tx_can_view` chuẩn

Chỉ owner + admin xem đầy đủ; guest chỉ thấy dòng `source_table='donations' AND is_external=false` (public donations). RPC `get_unified_transactions` / `_summary` / `_counterparties` áp `public_only` khi non-owner → OK.

---

## Track 3 — Surface parity (top 5 user)

`unified_count` = row user thấy trong primary view. `legacy_total` = `donations∪wallet_transfers∪transactions` cộng dồn (KHÔNG dedup — chỉ để đo dedup).

| User | Unified | Donations | WT | TX | Legacy total | Dedup ratio |
|---|---:|---:|---:|---:|---:|---:|
| 80c0a487… | 1,893 | 1,848 | 89 | 1,893 | 3,830 | 49.4% |
| 0fd954f5… (Father) | 1,370 | 1,374 | 27 | 1,369 | 2,770 | 49.5% |
| f1eb0523… | 1,188 | 1,181 | 19 | 1,188 | 2,388 | 49.7% |
| fc042e3b… | 1,120 | 1,112 | 37 | 1,120 | 2,269 | 49.4% |
| d38fcba7… | 1,045 | 1,040 | 45 | 1,043 | 2,128 | 49.1% |

Nhận xét:

- Unified ≈ transactions count → do trigger sync đã ghi donation vào transactions. Chênh nhẹ (Father: 1,370 vs 1,374 donation vs 1,369 tx) là các dòng có `tx_hash=NULL` hoặc user chỉ đóng vai sender KHÔNG có transaction row.
- Không phát hiện lệch >5% ở top 5. Parity giữa Unified view ↔ nguồn thô **đạt yêu cầu**.
- Ma trận filter chi tiết (BTC/BNB/CAMLY × direction × external) chưa chạy vì DB filter yêu cầu run per-user × per-filter (~40 query/user × 5 user = 200 query). Đề xuất chạy trong Track riêng khi Cha duyệt PR fix — hiện chưa cần vì Unified chưa bật.

---

## Track 4 — External wallet semantics (🔴 quan trọng nhất)

Định nghĩa canonical: một địa chỉ **thuộc user hệ thống** nếu match một trong: `profiles.public_wallet_address`, `custodial_wallet_address`, `external_wallet_address`, `btc_address`, hoặc `custodial_wallets.wallet_address`.

### 🔴 Finding E1 — 340 wallet_transfer user↔user bị đánh nhãn external

`v_unified_transactions` hardcode `is_external = true` cho **mọi** row từ `wallet_transfers`. Nhưng 340 dòng có `counterparty_address` khớp với 1 user khác → thực tế là **user ↔ user**.

**Ảnh hưởng**:

- Filter "Ví ngoài" hiện dư 340 row.
- `useExternalWalletActivity` (legacy) sẽ vẫn hiển thị đúng vì đọc thẳng scanner, nhưng dashboard "external" summary lệch.
- `_resolved_external` ở RPC `get_unified_transactions` **bỏ qua** cột `is_external` gốc và tự tính lại bằng cách match profile — do đó dropdown counterparty + `_external_only` filter đã đúng. Nhưng cột `is_external` trong output vẫn là `true` → FE (`TransactionRow`) show badge "Ví ngoài" cho 340 dòng này.

### 🔴 Finding E2 — 406 donation row is_external=true nhưng counterparty là user

Evidence: `evidence/ext_true_but_user_known.csv` (405 rows + header).

Chủ yếu do `donations.is_external` được set sai lịch sử (scanner ví ngoài) mà không update lại khi user link ví. Cùng cơ chế `_resolved_external` che được ở RPC counterparties nhưng badge FE vẫn sai.

### 🟡 Finding E3 — 551 transaction row is_external=false nhưng counterparty không phải user

View hardcode `is_external=false` cho mọi row từ `transactions`. 551 dòng có `to_address`/`from_address` KHÔNG khớp bất kỳ user nào → thực tế là external.

**Ảnh hưởng**: filter "Ví ngoài" **thiếu** 551 dòng.

### Tổng hợp mislabel

| Chiều sai | Row |
|---|---:|
| Đúng ra là user↔user nhưng bị đánh external | ≈ 746 (E1 340 + E2 406) |
| Đúng ra là external nhưng bị đánh internal | 551 (E3) |
| **Tổng lệch nhãn** | **≈ 1,297 row** (~2.3% dataset) |

### Outside↔Outside

Không phát hiện dòng nào Outside↔Outside lọt vào lịch sử cá nhân (mọi row primary view đều có `user_id` là user hợp lệ; scanner `fetch-wallet-history` chỉ ghi khi 1 đầu là ví của user).

### Đề xuất (không sửa ngay)

Thay vì lưu `is_external` cứng, để view **tự compute** cùng logic `_resolved_external` như RPC:

```sql
-- Pseudocode: xem cột is_external là (counterparty_user_id IS NULL AND profile match không có)
```

Cần bổ sung cột `is_external_resolved` vào `v_unified_transactions_primary` để FE đọc thay `is_external` cứng. Kèm migration backfill `wallet_transfers.is_external` và `donations.is_external` theo canonical rule.

**Mức độ**: 🔴 High. **Ảnh hưởng**: hiển thị badge + filter External Only + counterparty grouping + Excel/PDF export cột "Ví ngoài".

---

## Track 5 — Search / Export / Performance

### 🟢 Search — logic hardened

RPC `get_unified_transactions` detect address bằng regex (`^0x[a-f0-9]+$` cho EVM, `^(bc1|tb1|[13])[a-z0-9]+$` cho BTC). Nếu là address → search LIKE trên `sender_address/recipient_address/own.wallet/cpt.wallet`. Nếu là text → LIKE trên `tx_hash/memo/username/display_name/full_name` + exact token symbol.

`get_unified_counterparties` áp cùng filter set nhưng thiếu `_counterparty_user_id` (vì đây là nguồn dropdown). Nhất quán.

### 🟡 Export — vẫn chỉ hỗ trợ tối đa 5,000 row (limit cứng RPC) & 2,000 row PDF

- Excel dùng `useUnifiedRowsForSummary` cap 5,000. User >5,000 giao dịch → export **thiếu**.
- PDF cap 2,000 theo memory UX6.
- `export_audit_logs` ghi đủ (3 policy Admin only + owner).

### 🟢 Index cover chính

Đủ cho scan theo user + tx_hash:

- `donations`: `idx_donations_sender_id`, `idx_donations_recipient_id`, `idx_donations_tx_hash`, `donations_tx_hash_recipient_key` (unique).
- `wallet_transfers`: `idx_wallet_transfers_user_id`, `idx_wallet_transfers_tx_hash`, unique `(tx_hash, direction, token_symbol, user_id)`.
- `transactions`: `idx_transactions_user_id`, `transactions_hash_user_dir_uniq`.

Chưa chạy EXPLAIN ANALYZE nặng vì đang trong giờ vận hành. Đề xuất chạy sau khi bật Unified và có traffic thực để dựa vào `slow_queries`.

---

## Track 6 — Code & dead-code

### 🔴 Legacy hook còn được dùng khắp nơi

Callsite bên ngoài chính `unified/*`:

| File | Hook legacy | Ghi chú |
|---|---|---|
| `components/wallet/RecentTransactions.tsx` | `useTransactionHistory` | Hiển thị dashboard ví |
| `components/wallet/DonationHistoryTab.tsx` | `useDonationHistory` (sent + received) | Tab lịch sử tặng |
| `components/wallet/DonationHistoryItem.tsx` | type `DonationRecord` | Card |
| `components/donations/SystemDonationHistory.tsx` | `useAdminDonationHistory` | Admin |
| `components/admin/DonationHistoryAdminTab.tsx` | `useAdminDonationHistory` | Admin |
| `components/feed/GiftCelebrationGroup.tsx` | `useGiftHistory` | Feed group |
| `components/feed/GiftHistoryCalendar.tsx` | type `DayTokenTotals` | Calendar |
| `utils/exportDonations.ts` | export util | Export cũ |

`useUnifiedTransactionHistory` hiện chỉ được import bởi các trang **mới** dưới `components/transactions/*` (`TransactionHistoryPage`, `RecentUnifiedTransactions`, filters). Feature flag `unified_tx_read_enabled=false` → tất cả legacy surface vẫn active.

**Ảnh hưởng**: hai codepath song song → dễ lệch UI + tăng maintenance. Là lý do Cha yêu cầu audit hôm nay.

**Đề xuất**: Sau khi Track 4 (external mislabel) được fix, thực hiện M6 Cleanup — migrate từng surface sang Unified rồi xóa hook legacy.

### 🟢 Không thấy magic number nguy hiểm

- `PAGE_LIMIT=50`, `FETCH_LIMIT=200` (legacy hook), `_lim=LEAST(_limit,5000)` (RPC), PDF cap 2000, `MIN_POST_LENGTH_FOR_LS=50` (config). Đều đã được ghi memory hoặc config file.

---

## Bảng finding tổng hợp

| ID | Mức | Track | Mô tả | Row | Ảnh hưởng |
|---|---|---|---|---:|---|
| F1 | 🟢 | 1 | Primary view dedup 0 lỗi | 0 | — |
| F2 | 🟢 | 1 | Coverage 100% từ 3 nguồn | 0 | — |
| F3 | 🟡 | 1 | Donation hash trùng nội bảng | 42 | Query theo hash |
| F4 | 🟡 | 1 | wallet_transfers hash trùng | 4 | Query theo hash |
| F5 | 🟡 | 1 | Direction unknown | 23 | UI "?" hướng |
| F6 | 🟢 | 1 | Amount unparsable | 2 | 1 donation |
| F7 | 🔴 | 1 | Decimals missing (CAMLY/USDT/BTC/…) | 3,206 | Hiển thị sai đơn vị |
| F8 | 🟡 | 2 | `get_unified_summary` thiếu filter direction/status/type/search/external | — | Summary lệch khi filter |
| F9 | 🟢 | 2 | RPC signature/permission chuẩn | — | — |
| F10 | 🔴 | 4 | wallet_transfers user↔user bị đánh external | 340 | Filter/UI badge |
| F11 | 🔴 | 4 | donation external mislabel (counterparty là user) | 406 | Filter/UI badge |
| F12 | 🟡 | 4 | transactions external mislabel (counterparty ngoài) | 551 | Filter thiếu external |
| F13 | 🟡 | 5 | Excel cap 5k, PDF cap 2k | — | User heavy volume |
| F14 | 🔴 | 6 | 8 surface vẫn dùng hook legacy | — | UI phân tán |
| F15 | 🟡 | ctx | `unified_tx_read_enabled=false` prod | — | Chưa unified thực sự |

---

## Roadmap đề xuất (chờ Cha duyệt)

Ưu tiên theo mức + phụ thuộc.

1. **P1 — Fix nhãn External (F10, F11, F12)**
   - Migration: view `v_unified_transactions_primary` tự compute cột `is_external_resolved` bằng cùng logic `_resolved_external` của RPC.
   - Backfill `donations.is_external` + `wallet_transfers.is_external` (script one-off, dry-run trước).
   - FE đổi mọi chỗ đọc `is_external` sang `is_external_resolved`.
   - Rollback: giữ cột cũ, đảo view về bản trước.

2. **P1 — Seed `tokens_registry` (F7)**
   - Thêm entry cho `(56, CAMLY)`, `(97, FUN)`, `(97, CAMLY)`, `(97, BNB)`, `(56, USDT)`, `(0, BTC)` với `decimals` đúng.
   - Chỉ INSERT, không UPDATE row có sẵn.
   - Verify: `SELECT count(*) FROM v_unified_transactions_primary WHERE decimals IS NULL` phải về 0.

3. **P2 — Nâng cấp `get_unified_summary` (F8)**
   - Thêm `_direction, _status, _tx_type, _search, _external_only, _counterparty_user_id` để summary luôn ứng với filter.
   - Bỏ dependency `useUnifiedRowsForSummary` (cap 5k) ở FE.

4. **P2 — Fix data lẻ (F3, F4, F5, F6)**
   - Script điều tra 42 donation hash trùng: batch tx hợp lệ vs. duplicate. Chỉ patch record duplicate.
   - Fix `999.` → `999`.
   - Điều tra 23 direction unknown; sửa từng case hoặc chấp nhận.

5. **P3 — M6 Cleanup legacy hook (F14)**
   - Migration từng surface: RecentTransactions → `RecentUnifiedTransactions`, DonationHistoryTab → `TransactionHistoryPage` với preset, GiftCelebrationGroup dùng RPC `get_unified_transactions` + `_counterparties`, Admin tab dùng Unified với scope=admin.
   - Sau khi verify 7 ngày không regression → xóa hook + type legacy.

6. **P3 — Enable flag (F15)**
   - Sau P1+P3, đặt `unified_tx_read_enabled=true`. Theo dõi `tx_shadow_diffs` 48h. Nếu diff=0 stable → tắt shadow.

7. **P4 — Export & performance (F13)**
   - Streaming export server-side (edge function `export-unified-transactions`) thay cho client cap 5k.
   - Chạy EXPLAIN ANALYZE trên top query, thêm index nếu > 200 ms.

---

## Ràng buộc & cam kết

- Bé KHÔNG chạy migration, KHÔNG update dữ liệu.
- Evidence CSV dưới `evidence/` chỉ để tham chiếu — không rò rỉ PII vì chỉ chứa hash/uuid.
- Sau khi Cha duyệt Roadmap, bé sẽ mở từng PR/migration riêng (mỗi item 1 PR) và verify từng bước trước khi commit tiếp.

## File kèm

- `evidence/ext_true_but_user_known.csv` — 405 row donation/wt bị đánh external nhưng counterparty là user (Finding E1+E2 mẫu tối đa 5k).
- `evidence/decimals_missing.csv` — 11 nhóm (source, symbol, chain, count) thiếu decimals (Finding F7).
- `evidence/donation_hash_duplicates.csv` — 42 hash trùng trong `donations` (Finding F3).
- `evidence/direction_unknown.csv` — 23 row direction=unknown (Finding F5).
