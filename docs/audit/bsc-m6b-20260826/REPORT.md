# BSC — Tiến độ #2 (đo gap M6B) · #3 (export fix) · #4 (audit is_external)

Ngày: 2026-08-26

---

## #2 · Đo gap M6B theo lô (token × tháng) — ĐÃ XONG RUNTIME

Hạ tầng:
- Bảng `public.m6b_gap_scan_batches` (RLS: admin đọc, service_role ghi).
- RPC service-role-only: `m6b_gap_plan_batches`, `m6b_gap_claim_next_batch`, `m6b_gap_scan_run_batch`.
  Đã revoke EXECUTE của `anon`/`authenticated`.
- Edge `m6b-gap-scan`: auth = CRON secret / service-role key / admin JWT; single-flight qua `job_leases` (`m6b-gap-scan`).

Định nghĩa gap: dòng `transactions` KHÔNG có đối ứng ở `donations`/`wallet_transfers`
(theo `tx_hash` + `chain_id`) VÀ bị whitelist của `v_unified_transactions` loại khỏi view.

Kết quả chạy hết (4 lượt gọi, 89/89 lô, 0 lô lỗi):

```
batches_total: 89
batches_done : 89
batches_error: 0
rows_scanned : 64 313
gap_total    : 57
```

Phân bố 57 dòng gap: 53 CAMLY chain 56 · 3 FUN chain 97 · 1 CAMLY chain 137.

Đối chiếu số cũ:
- "295 dòng whitelist" (báo cáo 24/08) là **đếm theo tiêu chí khác** (dòng thiếu counterpart nhưng vẫn
  whitelist-visible, tức vẫn hiển thị trong view) → không phải gap thật.
- "~29 dòng" ước tính gốc thấp hơn vì trước đây query timeout, chỉ chạy được một phần.
- Con số chuẩn hiện tại: **57 dòng bị loại khỏi Unified History**, tuyệt đại đa số là CAMLY chain 56.

Kết luận: quy mô gap nhỏ (0,09% trên 64 313 dòng `transactions` đã quét), không có dòng BTC/USDT/BNB nào bị mất.

---

## #3 · Export sai số liệu — đã build song song, đã đối chiếu

Đã tạo (chưa thay consumer nào):
- `src/utils/export/mapUnifiedRows.ts` — map `UnifiedTransactionRow` → `TxExportRow`, giữ nguyên nhãn tiếng Việt.
- `src/hooks/useUnifiedTransactionsExport.ts` — lazy `fetchRows()`, phân trang RPC `get_unified_transactions`
  500 dòng/lượt, hard cap 50 000, không tự chạy khi mount.

Đối chiếu tháng gần nhất (01/08 → 31/08/2026):

| Nguồn | Số dòng |
|---|---:|
| Export CŨ (đọc `donations`) | 1 879 |
| Export MỚI (unified, `donations` leg) | 3 560 |
| Export MỚI (`transactions` reconciliation) | 57 |
| **Tổng MỚI** | **3 617** |

Chênh lệch giải thích được hoàn toàn: unified ghi **2 chân** (người tặng + người nhận) cho mỗi khoản quà
nội bộ, cộng 57 dòng reconciliation. Không có dòng nào bị mất so với export cũ.

Đối chiếu theo từng user (3 user nhiều giao dịch nhất tháng 8) — khớp 100%:

```
user_id                              | unified | export cũ
fc042e3b-691a-4b6c-b1e9-efe97d3430db |     220 |       220
b7856e97-9bff-4e2d-8448-c4395bf0548b |     131 |       131
040919cc-cd76-4b2f-8f21-270910424e8b |     127 |       127
```

⇒ Ở scope 1 user, hook mới **không sinh dòng dư**; phần dư chỉ xuất hiện ở scope global/admin
(vì đếm cả 2 chân của cùng một khoản). Đủ điều kiện thay consumer, nhưng **chờ Cha/CTO duyệt** trước khi
đổi `WalletTransactionHistory` / `HistoryTab` / `DonationHistoryAdminTab`.

---

## #4 · `is_external` hardcode `false` trong nhánh UNION `transactions` — AUDIT, CHƯA SỬA

Universe địa chỉ nội bộ: `profiles.public_wallet_address`, `profiles.btc_address`,
`custodial_wallets.wallet_address` (240), `profile_btc_aux_addresses` (1 707).

| Tiêu chí | Số dòng |
|---|---:|
| Tổng dòng nhánh `transactions` trong view | 1 118 |
| Counterparty KHÔNG thuộc universe nội bộ → lẽ ra `is_external = true` | 1 063 |
| Counterparty nội bộ → `false` là đúng | 55 |

Ảnh hưởng quyết định nghiệp vụ:
- `get_benefactor_leaderboard` và logic tạo `gift_celebration` **không đọc** `v_unified_transactions`
  ⇒ **0 quyết định BXH/gift** bị sai vì giá trị này.
- Ảnh hưởng thật: **hiển thị** — nhãn "Ví ngoài" trong lịch sử/export và **bộ lọc `externalOnly`**
  (`_external_only=true`) bỏ sót 1 063 dòng lẽ ra phải xuất hiện.

Đề xuất fix (chờ duyệt): thay `false AS is_external` bằng biểu thức
`NOT EXISTS (counterparty ∈ universe nội bộ)` tính trong CTE `tx`, dùng cùng bảng địa chỉ như trên,
không đổi các cột khác của view. Reversible bằng `CREATE OR REPLACE VIEW`.

---

## Còn treo
- #5 Treasury CAMLY · #6 atomic upsert · #7 `FALLBACK_PRICES` hardcode — chờ Cha giao.
- BTC: cửa sổ quan sát 7 ngày, chỉ báo khi có tín hiệu hoặc tới 02/09.
