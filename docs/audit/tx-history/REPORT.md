# CTO AUDIT — Transaction History Architecture (Read-only)

> Scope: kiến trúc ghi nhận, chuẩn hoá, lưu trữ, tổng hợp, đồng bộ, hiển thị
> lịch sử giao dịch FUN Profile. Không sửa code, không migration, không build.
> Ngày audit: 30/06/2026. Audit run: read-only DB queries + static code review.

## 0. Executive Summary

| Mức | Số phát hiện | Tóm tắt |
|-----|--------------|---------|
| 🔴 Critical | 3 | Không có Unified Ledger; scanner ghi không qua Token Registry; Direction/Chain do FE infer |
| 🟠 High     | 4 | Donations bị dùng như sổ cái; aggregation FE ≠ export; BTC pipeline 2 luồng chưa đồng nhất; KNOWN_TOKENS hard-code trong `auto-scan-donations` |
| 🟡 Medium   | 5 | Cache/poll mỗi surface khác; legacy table `wallet_history`; 9 bảng `*_backup_*` còn dữ liệu; 7 edge backfill chồng chéo; popup ≠ history copy 950 LOC |
| 🟢 Low      | 3 | Patch tạm BTC-0x guard; inferChainId theo symbol; React Router future-flag warnings |

**Số liệu sống (ngày audit):**

| Metric | Giá trị | Ghi chú |
|---|---|---|
| `donations` confirmed có `tx_hash` | **27 794** | nguồn lịch sử chính UI đang đọc |
| `transactions` tổng | **55 158** | sổ cái phụ, lớn hơn donations 2× |
| donations thiếu trong `transactions` (sender-side) | **0** | trigger `trg_sync_donation_to_transactions` đang chạy đúng |
| `wallet_transfers` thiếu trong `transactions` | **0** | trigger `trg_sync_wallet_transfer_to_transactions` ok |
| Cặp duplicate `(tx_hash,user_id)` trong `transactions` | **0** | unique index đang chặn tốt |
| Donations có `token_symbol` không nằm trong registry | **0** | nhưng so sánh theo SYMBOL, không theo `(chain_id, contract)` → C2 |
| Donations `is_external=true` | **1 639** | bị `useTransactionHistory` đẩy vào FE qua fallback (vẫn hiển thị) |
| `swap_transactions` tổng | **46** | không được surface nào ngoài /swap đọc |
| `suspicious_wallet_events` 30 ngày | **296** (toàn bộ reason = `unknown_contract`) | registry guard luồng đọc đang hoạt động |
| Tokens registry active | **9** (BTC, BNB, BTCB, CAMLY, USDT, TONCOIN, CAMLY-tn, FUN-tn, tBNB-tn) | thiếu chain mainnet `FUN`, không có chain ETH |

**Kết luận tổng:** Sổ cái KHÔNG sai số tài chính tại thời điểm audit (trigger
đang giữ `transactions` đồng bộ với `donations`+`wallet_transfers`), nhưng
**kiến trúc đang ở trạng thái “patch-by-patch”, không production-grade**.
Có ≥ 3 nguồn đọc khác nhau cho cùng khái niệm “lịch sử”, scanner ghi không
đi qua registry, và registry chỉ guard 1 chiều (read). Bất kỳ scanner mới nào
ghi thẳng vào `donations`/`transactions` cũng có thể bypass registry và lặp
lại sự cố CAMLY 12/06 hoặc spoof USDT.

---

## 1. Kiến trúc hiện tại

### 1.1 Tables (sổ cái và phụ trợ)

```
                       ┌─────────────────────────┐
   write path  ───►    │  donations (35 cols)    │ ◄── 99 ref FE/edge
                       │  status, type, is_ext   │
                       └────────────┬────────────┘
                                    │ trg_sync_donation_to_transactions
                                    ▼
                       ┌─────────────────────────┐
                       │  transactions (11 cols) │ ◄── 21 ref
                       │  unique(tx_hash,user_id)│
                       └────────────┬────────────┘
                                    ▲
                       ┌────────────┴────────────┐
                       │  wallet_transfers       │ ◄── 16 ref
                       └─────────────────────────┘
                       ┌─────────────────────────┐
                       │  swap_transactions (46) │ ◄── chỉ /swap
                       └─────────────────────────┘
   guard (read only) ─►│ tokens_registry (9)     │  suspicious_wallet_events (296/30d)
                       │ wallet_reconciliation_* │  wallet_scan_metrics
                       └─────────────────────────┘
   legacy/backup       │ wallet_history, 9× *_backup_*, *_audit_* (RLS off một số)
```

### 1.2 Hooks/Components đọc lịch sử

| Surface | Hook | Datasource | Cache | Poll | Pagination |
|---|---|---|---|---|---|
| `/wallet/history` Personal | `usePublicDonationHistory` (donations) + `useBtcTransactions` | donations + BTC RPC | react-query default | thủ công | 200 rows/page |
| External Wallet card | `useExternalWalletActivity` → `fetch-wallet-history` edge | Moralis + BTC + registry guard | staleTime 10s | 20s auto | limit 30 |
| Wallet overview "Recent" | `useTransactionHistory` | `transactions` + `donations` merge (fallback) | default | thủ công | 50 final |
| Profile popup `WalletTransactionHistory` | `usePublicDonationHistory` (donations) | donations | default | thủ công | 200/page |
| Export Excel/PDF | `mapDonationsToRows(donations)` | donations only | n/a | n/a | EXPORT_LIMITS |

> **Phát hiện 1.2:** 3 hook khác nhau cho cùng câu hỏi “lịch sử của tôi”.
> Popup và HistoryTab dùng cùng `usePublicDonationHistory` nên nội dung
> giống nhau, nhưng **RecentTransactions hiển thị nguồn khác** (transactions
> merge donations) ⇒ user thấy số dòng / direction / format khác nhau giữa
> 2 chỗ trong cùng app.

### 1.3 Write path (scanner / webhook / recovery)

| Function | Trigger | Output | Registry-aware? |
|---|---|---|---|
| `moralis-webhook` | on-chain event push | donations + wallet_transfers + posts(gift) | ❌ |
| `auto-scan-donations` | cron/manual poll BSC | donations | ❌ (hard-code `KNOWN_TOKENS` 3 token + native BNB) |
| `fast-scan-donations` | manual quick scan | donations | ❌ |
| `scan-btc-transactions` | cron/BTC polling | donations + wallet_transfers (BTC) | n/a (registry mới chỉ EVM) |
| `scan-treasury-*` (3 fn) | admin treasury | donations | ❌ |
| `scan-my-incoming` | user-pull | donations | ❌ |
| `wallet-reconciliation-cron` | pg_cron 30' | bù gap | một phần |
| `btc-history-repair`, `scheduled-reconciliation`, `recover-donations-from-chain`, `backfill-*` × 7 | manual/cron | sửa hậu kỳ | một phần |
| `fetch-wallet-history` (READ-only) | live UI fetch | trả về UI | ✅ (guard đầy đủ + log suspicious) |

> **Phát hiện 1.3:** Registry guard chỉ chặn **đọc**. Tất cả writer đang
> chạy với danh sách token cứng. Nếu một scammer deploy contract giả
> mạo symbol `USDT` hoặc `CAMLY`, scanner sẽ ghi thẳng vào `donations`
> mà không có lớp validate địa chỉ contract.

---

## 2. Luồng dữ liệu chuẩn 1 giao dịch

```
on-chain event
   │
   ▼
[scanner / webhook]  ─── ❌ KHÔNG kiểm tra (chain_id, contract) ∈ registry
   │
   ▼
donations  (+ posts gift_celebration nếu sender_id ≠ null)
   │  trigger
   ▼
transactions (unique tx_hash+user_id)
   │
   ▼
─────────── đọc bởi 3 hook khác nhau ───────────
useTransactionHistory   usePublicDonationHistory   useBtcTransactions
   │                         │                          │
RecentTransactions        HistoryTab + Popup        BTC tab in HistoryTab
                              │
                              ▼
                       mapDonationsToRows → Excel/PDF
```

### 2.1 Đâu là Source-of-Truth (matrix)

| Field | Ghi bởi | Đọc bởi | Xung đột |
|---|---|---|---|
| `tx_hash` | scanner | mọi UI | ✅ ok |
| `from/to_address` | scanner | UI, export | ⚠ chữ hoa/thường — cần lowercase chuẩn (mem nhắc rồi nhưng chưa enforce qua trigger) |
| `amount` (display) | scanner tự `parseAmount(value, decimals)` | UI hiển thị thẳng | 🔴 decimals tự đoán theo Moralis, không reconcile registry → sự cố CAMLY 12/06 |
| `token_symbol` | scanner | UI | ⚠ tin scanner mù quáng, không cross-check contract |
| `chain_id` | scanner | UI; FE infer khi null bằng `inferChainId(token_symbol)` | 🔴 sai khi token cùng symbol trên 2 chain |
| `direction` (in/out) | FE infer `sender_id===userId` | UI/Export | 🔴 sai khi user có nhiều ví, self-transfer |
| `status` | scanner + `useTransactionHistory.refreshAll` (RPC receipt) | UI | ⚠ BTC không có receipt path; donations row không bao giờ tự cập nhật |
| `fee/gas` | scanner ghi `transactions.gas_used` (nullable) | UI không show | 🟡 mất số liệu |
| `is_external` | scanner ghi | FE filter | ✅ ok (chính sách no-gift đã implement) |

---

## 3. Những điểm đúng

1. **Trigger sync 2 chiều** (`trg_sync_donation_to_transactions`,
   `trg_sync_wallet_transfer_to_transactions`) hiện chạy đúng — 0 gap.
2. **Unique index** `transactions_tx_hash_user_unique` chặn duplicate tốt:
   0 nhóm duplicate trên 55K dòng.
3. **Registry guard** ở `fetch-wallet-history` chặn tuyệt đối token spoof
   khỏi UI external wallet; 296 event suspicious / 30 ngày đã được log đúng.
4. **`external_wallet_no_gift_policy`** giữ 1 639 dòng `is_external=true`
   không tạo post gift, đúng spec.
5. **Export** đi qua `mapDonationsToRows` + audit log + limit (50K/5K/100K).

---

## 4. Những điểm sai (chi tiết)

### 🔴 C1 — Không có Unified Transaction Ledger
- **File**: `src/hooks/useTransactionHistory.ts`,
  `src/hooks/usePublicDonationHistory.ts`,
  `src/hooks/useWalletHistory.ts`,
  `src/hooks/useBtcTransactions.ts`.
- **Mô tả**: 4 hook + 5 surface đọc 3 nguồn (donations / transactions /
  Moralis live) với 3 logic merge khác nhau.
- **Impact**: cùng 1 giao dịch có thể xuất hiện 0/1/2 lần tuỳ surface;
  user export ra Excel sẽ khác số liệu hiển thị trên popup.
- **Severity**: Critical.

### 🔴 C2 — Scanner ghi không qua Token Registry
- **File**: `supabase/functions/auto-scan-donations/index.ts:5-10`
  (hard-code 3 token), `moralis-webhook`, `fast-scan-donations`,
  `scan-treasury-*`.
- **Mô tả**: chỉ check theo địa chỉ contract trong code; không SELECT
  `tokens_registry` trước khi insert `donations`. Bất kỳ token mới được
  add vào registry sẽ không tự được scanner pick-up; ngược lại token
  scam cùng symbol có thể được insert nếu logic mở rộng.
- **Impact**: nguy cơ tài chính cao (sự cố CAMLY 12/06 đã chứng minh).
- **Severity**: Critical.

### 🔴 C3 — Direction & Chain do FE infer
- **File**: `src/utils/export/mapRows.ts`, `useTransactionHistory.ts`
  `inferChainId`, `HistoryTab.tsx` filter logic.
- **Mô tả**: `direction` suy ra từ `sender_id===userId`; `chain_id`
  null → đoán theo symbol (BTC→0, else 56).
- **Impact**: user có nhiều ví (custodial + linked + BTC) sẽ thấy
  self-transfer hiển thị sai chiều; mở rộng ETH/Solana sẽ vỡ logic.
- **Severity**: Critical.

### 🟠 H1 — `donations` đang đóng vai sổ cái
- 99 ref đọc trực tiếp donations vs 21 ref đọc transactions.
- `donations` mô tả nghiệp vụ “tặng quà”, không phải mọi giao dịch
  (mint, claim, reward, swap, transfer thuần). Khi cần bổ sung loại
  mới phải thêm cột vào donations → schema phình to (35 cột hiện tại).

### 🟠 H2 — Aggregation FE ≠ Export
- HistoryTab/popup tính tổng từ donations cùng filter; Export cũng
  từ donations; nhưng RecentTransactions (overview) tính từ transactions.
  3 chỗ trên cùng app có thể hiển thị 3 số “tổng nhận / tổng gửi” khác.

### 🟠 H3 — BTC: 2 đường (scan + repair) chưa idempotent đầy đủ
- 9 bảng `btc_*_backup_*` / `btc_*_audit_*` chứng minh đã phải repair
  hậu kỳ nhiều lần. Pipeline BTC chưa có khoá idempotent kiểu
  `(txid, vout_index, address)`.

### 🟠 H4 — `KNOWN_TOKENS` hard-code
- `auto-scan-donations` chỉ biết USDT/BTCB/CAMLY + BNB sentinel.
  Token mới (FUN mainnet, TONCOIN) muốn được scan phải sửa code.

### 🟡 M1-M5
- M1: 5 surface dùng 5 cache/poll khác nhau (10s/20s/default).
- M2: `wallet_history` table legacy chưa xoá.
- M3: 9 bảng backup vẫn còn dữ liệu, một số RLS off.
- M4: 7 edge `backfill-*` chồng chéo, không có owner rõ.
- M5: Popup `WalletTransactionHistory.tsx` 957 LOC copy 80 % `HistoryTab` 846 LOC.

### 🟢 Low
- L1: `useTransactionHistory` guard “BTC có 0x...” là patch tạm.
- L2: `inferChainId` đoán bằng symbol.
- L3: React Router future-flag warnings (không liên quan ledger).

---

## 5. Root Cause

1. **Thiếu lớp Normalization tập trung**: mỗi scanner tự parse, tự
   quyết decimals/symbol/chain — không có hàm chuẩn duy nhất.
2. **Registry chỉ phục vụ read path**: không inject vào write path
   nên không đảm bảo tính nhất quán giữa 2 chiều.
3. **Donations đảm nhiệm cả "gift" và "ledger"**: 2 trách nhiệm
   trộn lẫn ⇒ schema phình, query khó, dễ phát sinh duplicate logic.
4. **Không có Read API (view) duy nhất**: mỗi UI tự viết query.

---

## 6. Technical debt

| ID | Mô tả | File:line |
|---|---|---|
| TD-01 | 3 hook history độc lập, logic merge khác nhau | `useTransactionHistory.ts:30-109`, `usePublicDonationHistory.ts:46-`, `useWalletHistory.ts:1-` |
| TD-02 | Hard-code KNOWN_TOKENS | `auto-scan-donations/index.ts:5-10` |
| TD-03 | inferChainId theo symbol | `useTransactionHistory.ts:25-28` |
| TD-04 | Guard BTC-0x ở client | `useTransactionHistory.ts:56-63` |
| TD-05 | Popup ≠ history nhưng copy layout | `WalletTransactionHistory.tsx` (957) vs `HistoryTab.tsx` (846) |
| TD-06 | 7 fn `backfill-*` chồng chéo | `supabase/functions/backfill-*` |
| TD-07 | 9 bảng `*_backup_*` / RLS off | `btc_*_backup_20260621`, ... |
| TD-08 | `wallet_history` legacy | DB |
| TD-09 | Export-only datasource = donations | `utils/export/mapRows.ts` |
| TD-10 | swap_transactions không vào history | DB + UI |

---

## 7. Nguy cơ lệch tài chính

| ID | Risk | Mức |
|---|---|---|
| R-01 | Token scam ghi thẳng vào donations qua scanner mới | Critical |
| R-02 | Decimals drift (CAMLY-pattern) tái diễn khi add token | Critical |
| R-03 | Self-transfer hiển thị nhân đôi summary (in + out cùng user nhiều ví) | High |
| R-04 | Export Excel cho user lệch số với UI khi user mở swap tab | High |
| R-05 | BTC reorg / UTXO multi-output ghi sai change address | Medium |
| R-06 | Approve / TransferFrom bị diễn dịch thành Gift | Medium |
| R-07 | Donation status không chuyển từ pending → confirmed cho BTC | Medium |

---

## 8. Kiến trúc production đề xuất

```
        ┌──────────────────────────────────────────┐
        │ Token Registry + Chain Registry          │  source-of-truth metadata
        └──────────────────────────────────────────┘
                       ▲ inject vào CẢ write & read
   ┌────────── Scanners / Webhooks ──────────┐
   │  validate(chain_id, contract) ∈ registry │
   │  normalize(amount, decimals, symbol)     │
   │  enrich(price, label, direction)         │
   │  reject → suspicious_wallet_events       │
   └──────────────────┬───────────────────────┘
                      ▼
         ledger_entries  (append-only SoT)
         PK (chain_id, tx_hash, log_index, direction, user_id)
                      │
        ┌─────────────┴────────────────┐
   SQL views (read API)         outbox consumers
   v_user_tx_history            → notifications
   v_user_summary               → gift_celebration posts
   v_export_rows                → light_actions
   v_admin_reconciliation       (idempotent)
                      │
        ┌─────────────┴────────────────┐
        UI: HistoryTab / Popup / Recent / Export — TẤT CẢ đọc cùng view
```

Nguyên tắc bắt buộc:
1. 1 ledger duy nhất, append-only, unique key gồm `log_index`.
2. Mọi write đi qua `normalize()` chung; reject ghi `suspicious_wallet_events`.
3. Direction/chain quyết tại **scanner** (server), không phải FE.
4. UI chỉ đọc qua **view** (1 surface = 1 view).
5. Audit `ledger_write_audit` (source fn + request id) cho mọi insert.
6. Monitoring: extends `wallet_scan_metrics`, alert drift hằng giờ.
7. Test matrix ≥ 150 case (mục 11).

---

## 9. Roadmap

| Phase | Mục tiêu | Effort | Output |
|---|---|---|---|
| **0** ✅ | Audit này | S | REPORT.md |
| **1 — Harden write path** | Tất cả scanner phải gọi `validateToken(chain_id, contract)` từ `tokens_registry`; seed FUN mainnet + chains thiếu; thêm `log_index` vào schema; backfill | M | migration + edge refactor |
| **2 — Unified read view** | Tạo `v_user_transaction_history` UNION donations+transactions+wallet_transfers+swap_transactions+BTC + register; chuyển HistoryTab + Popup + Recent + Export sang view | M | 1 SQL view + 1 hook chuẩn |
| **3 — Append-only ledger** | Introduce `ledger_entries` + outbox; migrate writers từng cái; giữ donations/wallet_transfers thành projection của ledger | L | new schema + dual-write window + cutover |
| **4 — Multi-chain ready** | `chains_registry`; ETH/Solana adapters | M | adapter modules |
| **5 — Observability + SLA** | Dashboard drift, alert, replay tooling, e2e 150 case Playwright | M | dashboards + tests |

---

## 10. Test matrix (skeleton ≥ 150 case)

Trục: **chain × token × direction × surface × edge_case**.

- chain: BTC, BSC-main, BSC-testnet, future ETH (4)
- token: BTC, BNB, BTCB, USDT, CAMLY, FUN, TONCOIN, registry-blocked, fake-spoof (9)
- direction: in, out, self, internal-multi-wallet, ext→user, user→ext, swap (7)
- surface: HistoryTab, Popup, Recent, Export-xlsx, Export-pdf, ExternalCard, Notif, GiftPost (8)
- edge: pending→confirmed, failed, replaced, reorg, dust, fee-only, multi-output BTC, approval-only, gasless, decimals-drift (10)

File CSV chi tiết sẽ được sinh khi vào Phase 2 (chạy thực bằng Playwright).

---

## 11. Kết luận

- **Sổ cái hiện tại không sai số** tại thời điểm 30/06/2026 nhờ trigger
  sync + unique index + registry guard luồng đọc.
- **Kiến trúc chưa production-grade**: rủi ro lệch tài chính khi mở
  rộng (token mới, chain mới, scanner mới) vẫn ở mức Critical.
- **Đề nghị**: Cha duyệt vào **Phase 1 — Harden write path** trước
  khi mở rộng bất kỳ scanner/chain nào nữa. Sau Phase 1 đo lại drift
  để quyết Phase 3 (ledger refactor).

> Báo cáo này đã thực hiện đúng cam kết: **không sửa code, không
> migration, không build**. Chỉ truy vấn read-only DB và đọc file.
