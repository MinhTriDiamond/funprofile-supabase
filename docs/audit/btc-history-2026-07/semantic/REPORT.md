# Sub-phase C — BTC Transaction Semantic Audit

Ngày: 2026-07-03
Trạng thái: **READ-ONLY AUDIT — KHÔNG fix code / DB.**
Scope: 4 transaction Cha chụp ảnh (Utopia→Sora, Kim→Sora, Kim→Thu Trang, Thiên Hạnh→Utopia).

---

## TL;DR — Root cause mới, quan trọng hơn RC-1→RC-4

**RC-10 (CRITICAL): `hd_input_back` auto-discovery import nhầm HOT WALLET của Binance vào `profile_btc_aux_addresses` của user.**

- Address `bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h` bị gán làm aux của `@angelkim` (source=`hd_input_back`, 2026-06-11).
- Address này có **2,262,799 tx** và **funded_sum ≈ 59,353,478 BTC** — đây là hot wallet exchange (99% là Binance).
- Hệ quả: mọi giao dịch Binance có bất kỳ output nào trùng địa chỉ user FUN Profile khác sẽ **tự sinh donation "Kim → user X"** dù Kim không hề gửi.
- **UTXO parser KHÔNG SAI về amount** (số BTC = đúng output cho recipient). **Cái sai là counterparty**: `sender_id` được suy ra từ input address, mà input là exchange chứ không phải user.

Có **711 aux addresses toàn hệ thống** được import qua cơ chế `hd_input_back` — cần audit tương tự (angelhoangtydo: 349, angelthuha: 185, trogiauco: 48…).

---

## Bảng semantic đầy đủ cho 4 tx

### TX1 · `40f8c0567f…39bb01d3` — UI: "Utopia → Sora 0.5 BTC"

| Bước | Giá trị |
|---|---|
| On-chain input | `bc1qfxr7…` = **angelutopia** (aux, `hd_change_auto`, 50 tx / 28 BTC — nghi nhưng thấp) — input 1.00000000 BTC |
| Out#0 | `bc1q0wmq7…` = **angelgiau** (main) → 0.50000000 BTC |
| Out#1 (change) | `bc1qfxr7…` = angelutopia self → 0.49999154 BTC |
| donations row | sender=angelutopia, recipient=angelgiau, amount=0.5, `is_external=TRUE` (⚠ SAI — cả 2 đều nội bộ) |
| wallet_transfers | chỉ có `in` cho angelgiau; **thiếu `out` cho angelutopia** |
| **Verdict** | Semantic amount + counterparty ĐÚNG on-chain. `is_external=true` sai. Thiếu WT `out`. |

### TX2 · `2f38060e1f…8cae3b8c` — UI: "Kim → Sora 1.01846548 BTC"

| Bước | Giá trị |
|---|---|
| Input | `bc1q964g…` = **angelkim** (aux, `hd_change_auto`) — 2.48873689 BTC (chỉ 2 tx — plausible) |
| Out#0 | `bc1qyzqe6…` = **angelgiau** (aux) → 1.01846548 BTC |
| Out#1 | `bc1qrq0v0…` = **angeldieungoc** (main) → 1.47027000 BTC |
| donation A | sender=angelkim, recipient=angelgiau, 1.01846548, `chain_family=bitcoin`, `is_external=false` ✓ |
| donation B | sender=**funtreasury**, recipient=angeldieungoc, 1.47027, `chain_family=EVM` ❌ (BTC tx bị gán chain=evm và sender=funtreasury sai) |
| wallet_transfers | `in father 1.47027 btc`, `in angeldieungoc 1.47027 btc` — **double-attribution** cho cùng output |
| **Verdict** | Donation A OK. Donation B **SAI sender (funtreasury) và SAI chain_family (evm)**. WT có 2 rows `in` cho cùng 1 output → đếm double. |

### TX3 · `05a78ade04…42a82935` — UI: "Kim → Thu Trang 0.15091506 BTC"

| Bước | Giá trị |
|---|---|
| Input | `bc1qm34l…` = **Binance hot wallet** (2.26M tx, 59M BTC) — **BỊ IMPORT NHẦM làm aux của angelkim** |
| Outputs | 13 outputs (12 recipient + 1 change 38.79 BTC quay lại chính ví Binance) |
| Out#11 | `bc1qkh8f…` = angelthutrang (main) → 0.15091506 BTC |
| Out#4 | `bc1qpt527g…` = angelkim (aux, 6 tx / 0.011 BTC) → 0.003485 BTC — nhưng KHÔNG có donation ↩ bỏ sót |
| donation | sender=angelkim, recipient=angelthutrang, 0.15091506, `is_external=TRUE` |
| wallet_transfers | chỉ `in angelthutrang`; **thiếu `out` cho angelkim** |
| **Verdict** | **SAI SENDER**. Đây là giao dịch của Binance, không phải Kim. Amount + recipient đúng nhưng counterparty (Kim) hoàn toàn bịa. 11 outputs khác bỏ sót. `is_external=true` mâu thuẫn với việc gán sender nội bộ. |

### TX4 · `1da80ffa82…13be8559` — UI: "Thiên Hạnh → Utopia 0.90704454 BTC"

| Bước | Giá trị |
|---|---|
| Input#0 | `bc1qc8pv…` = **angelthienhanh68** (aux, `hd_input_back`, 2 tx) — 0.90865436 BTC |
| Input#1 | `bc1qsw8f…` = **angelhoangtydo** (aux, `hd_change_auto`) — 0.00139227 BTC ⚠ CO-INPUT 2 user khác nhau |
| Out#0 | `bc1q33kk5…` = **angelutopia** (aux) → 0.90704454 BTC |
| Out#1 | `bc1qtaml2…` = angelthienhanh68 self → 0.003 BTC (change) |
| donation A | sender=angelthienhanh68, recipient=angelutopia, 0.90704454, `chain_family=bitcoin` (recipient_address rỗng) |
| donation B | sender=**angelgiau**, recipient=**angelbachviet**, 0.003, `chain_family=EVM` ❌❌ (BTC tx được ghi thành EVM donation hoàn toàn khác cặp user) |
| wallet_transfers | **không có row nào** cho tx này |
| **Verdict** | Donation A gần đúng nhưng KHÔNG phản ánh angelhoangtydo là co-signer. Donation B **bịa hoàn toàn** — cùng tx_hash bị dùng cho một cặp user/chain khác (RC-6: tx_hash collision hoặc scanner ghi ẩu). Thiếu WT. |

---

## Root cause tổng hợp (mới)

| RC | Mô tả | Impact |
|---|---|---|
| **RC-10** | `hd_input_back` import hot wallet exchange (Binance) vào aux của user | Sinh donation SENDER SAI cho hàng nghìn tx của exchange |
| **RC-11** | Cùng 1 output trong BTC tx sinh 2 donation (1 cho recipient thật, 1 cho `funtreasury` với `chain_family=evm`) | Double-count treasury flow, sai chain_family |
| **RC-12** | Cùng tx_hash được ghi thành donation ở CẢ `chain_family=bitcoin` và `chain_family=evm` với cặp user hoàn toàn khác | Bịa donation không tồn tại on-chain |
| **RC-13** | Batch tx với N outputs nhưng chỉ sinh 1 donation → **bỏ sót** N-1 recipient khác | Mất giao dịch |
| **RC-14** | `wallet_transfers.OUT` không được sinh cho BTC donations dù có sender_id nội bộ | Lịch sử "gửi" của sender BTC bị trống |
| **RC-15** | `is_external=TRUE` được set cho donation mà cả sender & recipient đều nội bộ | Sai phân loại nội bộ/ngoài, sai leaderboard |
| **RC-16** | Co-input BTC (2 user cùng ký 1 tx) không được phản ánh — toàn bộ amount gán cho 1 user | Sai đóng góp |

---

## Đề xuất Sub-phase D (chưa thực hiện — chờ Cha duyệt)

1. **Không fix code** cho tới khi Cha đọc xong report này.
2. **Freeze** ngay job/edge function chạy `hd_input_back` (grep chưa làm — chờ chỉ đạo).
3. Audit toàn bộ 711 aux addresses `source='hd_input_back'`:
   - Đánh dấu bất kỳ address nào có `tx_count > 100` hoặc `funded_sum > 10 BTC` là **exchange suspect**.
   - Liệt kê mọi donation/wallet_transfer sinh ra do các address suspect này.
4. Chuẩn bị plan revert: soft-delete donation sai, restore WT thiếu, sửa `is_external`, xoá aux exchange.
5. Ra chính sách mới cho HD discovery: chỉ import aux nếu địa chỉ **chưa có tx** trước lần user connect ví, hoặc `tx_count ≤ 20` + không có output tới `> 5` địa chỉ khác nhau.

---

## Evidence files

- `onchain_40f8c056.json`, `onchain_2f38060e.json`, `onchain_05a78ade.json`, `onchain_1da80ffa.json`
- `donations_4tx.csv`
- `wallet_transfers_4tx.csv`
