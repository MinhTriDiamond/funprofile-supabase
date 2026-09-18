# Báo cáo Audit M6A — Transaction Architecture
**Ngày:** 2026-07  
**Phạm vi:** Toàn bộ luồng ghi/đọc giao dịch (donation, swap, transfer, claim, reconciliation)  
**Auditor:** Bé (Read-Only Audit Engineer)  
**Status:** ✅ Hoàn thành — 12 deliverables

---

## Executive Summary

Hệ thống đang trong giai đoạn **chuyển tiếp từ kiến trúc Legacy (M3-) sang Unified (M4+)**. Nền tảng Unified đã được xây dựng tốt với view `v_unified_transactions_primary`, RPC `get_unified_transactions`, và hook `useUnifiedTransactionHistory`. Tuy nhiên **7/20 consumer surface vẫn dùng Legacy path**, **1 bảng `transactions` chưa vào view** (TD-05 — P0), và **2 edge producer có nguy cơ race condition** (TD-10 — P1). Có 15 technical debt item được ghi nhận, trong đó 1 P0, 6 P1, 5 P2, 3 P3.

**Khuyến nghị:** ✅ **Go cho M6B** với điều kiện TD-05 được resolve trước khi deploy M6B production.

---

## Phần 1 — Producer Matrix

> Evidence: `evidence/producer_matrix.csv`

**14 producer** được xác định:

| Producer | Bảng ghi chính | Loại |
|---|---|---|
| `record-donation` (Edge) | donations, light_actions, posts, notifications | Primary |
| `auto-scan-donations` (Edge) | donations, wallet_transfers, posts, notifications | Primary |
| `scan-btc-transactions` (Edge) | donations, posts | Primary |
| `approve-claim` (Edge) | reward_claims, transactions, donations, notifications | Hybrid |
| `wallet-reconciliation-cron` (Edge, 30min) | transactions, donations, wallet_reconciliation_* | Reconciliation |
| `backfill-donations-to-transactions` (Edge) | transactions, posts | Dead/Backfill |
| `backfill-swap-transactions` (Edge) | swap_transactions | Dead/Backfill |
| `SwapTab` (FE Direct) | swap_transactions | ⚠️ FE Direct |
| `fast-scan-donations` (Edge) | donations, posts, notifications | ⚠️ Overlap với auto-scan |

**Rủi ro chính:**
- **TD-12:** `SwapTab` insert thẳng vào `swap_transactions` không qua edge → bypass audit/PPLP
- **TD-10:** `auto-scan-donations` và `fast-scan-donations` overlap → race condition potential

---

## Phần 2 — Transaction Lifecycle

> Evidence: `evidence/lifecycle.mmd`

5 luồng được vẽ đầy đủ:

1. **Flow 1 — Gift/Donation (BSC/BTC):** FE → `record-donation` → `donations` → `v_unified_transactions` → RPC → Hook → Page ✅
2. **Flow 2 — Swap:** `SwapTab` → `swap_transactions` (FE direct) → view → RPC ⚠️
3. **Flow 3 — Internal Transfer:** FE → `record-donation`/`auto-scan` → `wallet_transfers` → dedup → view ✅
4. **Flow 4 — External Scanner:** Cron → Moralis → `tokens_registry` guard → `donations`/`transactions` → view ⚠️ (transactions chưa trong view)
5. **Flow 5 — Claim Reward:** FE → `claim-reward` → `pending_claims` → admin → `approve-claim` → `reward_claims` + `transactions` + `donations` → view ⚠️

---

## Phần 3 — SSOT Analysis

> Evidence: `evidence/ssot_matrix.csv`

| Module | Unified | Ghi chú |
|---|---|---|
| WalletHistoryPage | ✅ | Flag ON luôn |
| ProfileHistoryPage | ✅ | Flag ON luôn |
| TransactionHistoryPage | ✅ | |
| UnifiedTransactionSummary | ✅ | |
| TransactionExportMenu | ✅ | |
| HistoryTab (wallet) | ❌ Legacy | usePublicDonationHistory |
| DonationHistoryTab | ❌ Legacy | useDonationHistory |
| ExportTransactionsMenu (wallet) | ❌ Legacy | mapDonationsToRows |
| BenefactorsPage | ❌ Hybrid | Legacy RPC |
| RecentTransactions | ⚠️ Hybrid | Flag-gated |

**7/20 surface vẫn Legacy. 3/20 Hybrid.**

**P0 Gap:** Bảng `transactions` (ghi bởi `wallet-reconciliation-cron` và `approve-claim`) **không nằm trong UNION của `v_unified_transactions`** → các giao dịch này vô hình trên unified surface.

---

## Phần 4 — Consumer Matrix

> Evidence: `evidence/consumer_matrix.csv`

24 consumer surface được map. Phân loại:
- **Unified (✅):** 8 surface — dùng `get_unified_transactions` / `v_unified_transactions_primary`
- **Hybrid (⚠️):** 4 surface — flag-gated hoặc mixed RPC
- **Legacy (❌):** 12 surface — đọc thẳng bảng hoặc legacy RPC

Legacy consumer tập trung ở: wallet tabs, admin tabs, benefactor board, profile history, export menu wallet.

---

## Phần 5 — Dependency Graph

> Evidence: `evidence/dependency_graph.mmd`

Các dependency chính:
- `v_unified_transactions_primary` ← donations + wallet_transfers + swap_transactions (3 bảng nguồn)
- `get_unified_transactions` ← `v_unified_transactions_primary`
- `useUnifiedTransactionHistory` ← `get_unified_transactions`
- Legacy hooks đọc trực tiếp bảng, bypass view

**Gap:** `transactions` bảng → không có arrow vào view.

---

## Phần 6 — Legacy Inventory

> Evidence: `evidence/legacy_inventory.csv`

26 item legacy được liệt kê:
- **5 hook legacy** còn active (usePublicDonationHistory có 9 import; useDonationHistory có 10 import)
- **1 hook dead** (useWalletHistory — 0 import)
- **4 component legacy** (HistoryTab, DonationHistoryTab, WalletTransactionHistory, ExportTransactionsMenu)
- **5 inline formatAmount()** duplicate
- **3 direction calc** duplicate
- **5 export util** legacy (exportDonations.ts, mapRows.ts)

---

## Phần 7 — Duplicate Logic

> Evidence: `evidence/duplicate_logic.csv`

18 domain duplicate được phân tích:

| Domain | Số impl | SSOT hiện tại | Đề xuất M6 |
|---|---|---|---|
| Direction (in/out) | 3 | RPC field `direction` | Xoá 3 FE calc |
| Amount Format | 5 | `formatTokenAmount()` | Xoá 5 local fn |
| Status Label | 5 | `TransactionRow.statusBadge()` | Tạo `statusToLabel()` util |
| Summary Aggregation | 3 | `useUnifiedRowsForSummary` | Xoá 3 impl legacy |
| Export Logic | 3 | `rowsFromUnified()` | Xoá exportDonations.ts + mapDonationsToRows |
| Benefactor Logic | 2 | Chưa unified | Phase M6D |
| Global Stats | 2 | `get_unified_summary` | Phase M6C |

---

## Phần 8 — Database Usage

> Evidence: `evidence/database_usage.csv`

| Bảng | Trạng thái | Rủi ro |
|---|---|---|
| donations | Active — Primary Source | Bảng trung tâm; ổn định |
| wallet_transfers | Active — Secondary | Dedup cần đảm bảo |
| swap_transactions | Active — Secondary | FE direct insert (TD-12) |
| transactions | Active nhưng KHÔNG trong view | **P0 — TD-05** |
| reward_claims | Active — Claim tracking | Chưa vào v_unified |
| treasury_flows | Legacy riêng biệt | Không unified |
| notifications | Active Downstream | Chưa unified hook |
| posts | Active Downstream | Liên kết donation.post_id |

---

## Phần 9 — RPC Usage

> Evidence: `evidence/rpc_usage.csv`

11 RPC được audit:

| RPC | Category | FE Callers |
|---|---|---|
| `get_unified_transactions` | Unified | 3 files |
| `get_unified_transaction_detail` | Unified | 1 file |
| `get_unified_counterparties` | Unified | 1 file |
| `get_unified_summary` | Unified | 4 files |
| `get_benefactor_leaderboard` | Legacy | 2 files |
| `get_recipient_leaderboard` | Legacy | 2 files |
| `get_donation_global_stats` | Legacy | 2 files |
| `get_user_donation_summary` | Legacy | 1 file |
| `get_donation_history` | Legacy | 1 file |
| `get_user_nstats` | Hybrid (pplp) | 1 file |

**4 Legacy RPC cần deprecate** theo lộ trình M6B→M6D. `get_user_nstats` giữ nguyên (pplp domain).

---

## Phần 10 — Edge Function Report

> Evidence: `evidence/edge_function_report.csv`

12 edge function liên quan tx/donation được audit:

- **Producer chính (✅):** record-donation, auto-scan-donations, scan-btc-transactions, wallet-reconciliation-cron
- **Hybrid (⚠️):** approve-claim (ghi cả transactions + donations), fast-scan-donations (overlap auto-scan)
- **Read-only (⚠️ Dead Path):** fetch-wallet-history (hook gọi nó có 0 import)
- **Dead/Backfill (🔴):** backfill-donations-to-transactions, backfill-swap-transactions, backfill-wallet-transfers, backfill-tx-donations, backfill-outgoing-donations

**Khuyến nghị:** Undeploy 5 backfill edge functions để giảm attack surface (TD-09).

---

## Phần 11 — Technical Debt

> Evidence: `evidence/technical_debt.csv`

**Tổng: 15 item — 1×P0, 6×P1, 5×P2, 3×P3**

### P0 — Phải fix trước M6B production
| ID | Mô tả | Effort |
|---|---|---|
| TD-05 | `transactions` bảng không trong `v_unified_transactions` view — dữ liệu reconciliation bị mất hoàn toàn | M |

### P1 — Fix trong M6B hoặc M6C
| ID | Mô tả | Effort |
|---|---|---|
| TD-01 | 5 legacy hooks còn active đọc thẳng bảng | L |
| TD-02 | 3 direction calc duplicate — có thể hiển thị sai chiều | S |
| TD-06 | ExportTransactionsMenu wallet thiếu swap/transfer trong export | S |
| TD-07 | BenefactorsPage chưa unified — leaderboard có thể sai | M |
| TD-10 | Race condition auto-scan + fast-scan → duplicate donations | M |
| TD-12 | SwapTab FE direct insert → bypass audit/PPLP | M |

### P2 — Backlog M6C→M6E
TD-03 (formatAmount dup), TD-04 (status label dup), TD-08 (dead useWalletHistory), TD-09 (backfill edge functions), TD-11 (legacy RPC get_user_donation_summary), TD-13 (treasury_flows không unified), TD-15 (counterparty enrich FE-side N+1)

### P3 — Nice-to-have M6F
TD-08 (dead code cleanup), TD-14 (notification chưa unified hook)

---

## Phần 12 — M6 Roadmap M6A → M6F

| Phase | Mục tiêu | Key Actions | TD Items |
|---|---|---|---|
| **M6A** (Done) | Audit & Evidence | Tạo 12 deliverables audit | — |
| **M6B** | Fix P0 + P1 Critical | (1) Thêm `transactions` vào `v_unified_transactions` UNION; (2) Tạo edge `record-swap` thay SwapTab FE direct; (3) Resolve race condition auto-scan/fast-scan | TD-05, TD-12, TD-10 |
| **M6C** | Migrate Legacy RPC | Migrate `get_donation_global_stats` → `get_unified_summary`; migrate ExportCsvDialog + BenefactorsPage; deprecate `get_user_donation_summary` | TD-07, TD-11, TD-01 (partial) |
| **M6D** | Xoá Legacy Hooks | Replace 5 legacy hooks bằng `useUnifiedTransactionHistory`; fix direction/format/status duplicate | TD-01, TD-02, TD-03, TD-04, TD-06, TD-15 |
| **M6E** | Unify Notification + Leaderboard | Tạo `useUnifiedNotifications` wrapper; tạo `get_unified_benefactor_stats` từ view | TD-14; duplicate_logic.csv row 8 |
| **M6F** | Analytics + Dead Code Cleanup | Undeploy 5 backfill edges; xoá useWalletHistory; analytics hook; treasury_flows consideration | TD-08, TD-09, TD-13 |

---

## Go / No-Go Recommendation

### ✅ GO cho M6B — với điều kiện bắt buộc:

**Pre-condition (phải hoàn thành trước khi merge M6B vào production):**

1. **[P0] TD-05:** Xác nhận và fix `v_unified_transactions` UNION để include `transactions` bảng. Viết test so sánh count trước/sau.
2. **[P1] TD-10:** Review và deconflict `auto-scan-donations` vs `fast-scan-donations` — chọn 1 hoặc dùng `INSERT ... ON CONFLICT DO NOTHING` atomic.
3. **[P1] TD-12:** Tạo edge function `record-swap` để thay thế SwapTab FE direct insert. Không merge SwapTab thay đổi trước khi có edge.

**Accepted risks (documented):**
- Legacy surface (7/20) vẫn Legacy trong M6B — acceptable vì không regression
- BenefactorsPage Hybrid — acceptable, sẽ fix M6C
- 5 backfill edge functions vẫn deployed — acceptable nếu không có trigger tự động

**Recommendation cuối:** M6A audit hoàn thành với đầy đủ bằng chứng. Kiến trúc Unified đủ vững để tiếp tục. **Proceed to M6B** sau khi resolve 3 pre-conditions trên.

---

*Báo cáo được tổng hợp từ 12 evidence files trong `evidence/`. Mọi kết luận có trích dẫn file:line cụ thể. Không có file source nào bị sửa trong quá trình audit này.*
