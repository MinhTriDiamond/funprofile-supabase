# BTC address case-normalization — RAW EVIDENCE (điều tra thuần, không fix)

Ngày: 2026-08-24 · Điều kiện chặn Phase 3. Không đụng dữ liệu, không code.

## 1. Bảng/cột thật có lưu địa chỉ BTC (tìm qua `information_schema`)

Đang hoạt động: `profiles.btc_address`, `profiles.btc_addresses`, `profile_btc_aux_addresses.address`,
`btc_ownership_snapshot.address`, `btc_aux_address_review_queue.address`,
`btc_tx_semantic.sender_address/recipient_address`, `donations.sender_address/recipient_address`,
`transactions.from_address/to_address`, `wallet_transfers.counterparty_address`.
Bảng backup 2026-06/07 (`btc_*_backup_*`, `_backup_btc_p0_fix_*`) không tính vào Phase 3.

## 2. Đếm theo prefix + case hiện đang lưu

| Nguồn | Dạng | Case | Rows | Distinct |
|---|---|---|---|---|
| btc_aux_address_review_queue.address | bech32 (bc1) | all_lower | 509 | 509 |
| btc_aux_address_review_queue.address | legacy P2PKH (1) | **mixed** | 43 | 43 |
| btc_aux_address_review_queue.address | P2SH (3) | **mixed** | 159 | 159 |
| btc_tx_semantic.recipient_address | bech32 | all_lower | 5 | 5 |
| donations.recipient_address (BTC) | bech32 | all_lower | 405 | 60 |
| donations.sender_address (BTC) | bech32 | all_lower | 459 | 236 |
| donations.sender_address (BTC) | legacy P2PKH (1) | **mixed** | 1 | 1 |
| profile_btc_aux_addresses.address | bech32 | all_lower | 1352 | 1352 |
| profile_btc_aux_addresses.address | legacy P2PKH (1) | **mixed** | 128 | 128 |
| profile_btc_aux_addresses.address | P2SH (3) | **mixed** | 227 | 227 |
| profiles.btc_address | bech32 | all_lower | 141 | 140 |
| **profiles.btc_address** | **legacy P2PKH (1)** | **all_lower** | **1** | 1 |
| **profiles.btc_address** | **P2SH (3)** | **all_lower** | **1** | 1 |
| transactions.from_address (BTC) | bech32 | all_lower | 855 | 254 |
| transactions.from_address (BTC) | legacy P2PKH (1) | **mixed** | 4 | 4 |
| transactions.from_address (BTC) | P2SH (3) | **mixed** | 2 | 2 |
| transactions.from_address (BTC) | rỗng `''` | — | 407 | 1 |
| transactions.to_address (BTC) | bech32 | all_lower | 1011 | 164 |
| transactions.to_address (BTC) | legacy P2PKH (1) | **mixed** | 40 | 26 |
| transactions.to_address (BTC) | P2SH (3) | **mixed** | 7 | 3 |
| transactions.to_address (BTC) | rỗng `''` | — | 210 | 1 |
| wallet_transfers.counterparty_address (BTC) | bech32 | all_lower | 808 | 397 |
| wallet_transfers.counterparty_address (BTC) | legacy P2PKH (1) | **mixed** | 49 | 32 |
| wallet_transfers.counterparty_address (BTC) | P2SH (3) | **mixed** | 9 | 5 |

Đọc: hầu hết legacy/P2SH **vẫn giữ mixed case (nguyên vẹn)**. bech32 toàn bộ all_lower (an toàn theo BIP-173).

## 3. Code đang `.toLowerCase()` lên địa chỉ BTC

`supabase/functions/wallet-reconciliation-cron/index.ts`
- 150: `p.btc_address.toLowerCase()` (map chủ ví BTC)
- 151: `a.address.toLowerCase()` (aux address)
- 164: `a.address.toLowerCase()` (Father aux)
- 165: `p.btc_address?.toLowerCase()` (Father main)
- 189: `vin[0].prevout.scriptpubkey_address.toLowerCase()` (from on-chain)
- 193: `vout.scriptpubkey_address.toLowerCase()` (to on-chain)

`src/hooks/useWatchedWallets.ts:54` — `w.address.toLowerCase()` dùng chung cho mọi chain (gồm `btc`).

Tất cả các vị trí trên áp lowercase **vô điều kiện cho cả 3 dạng** ⇒ nếu on-chain trả về `1...`/`3...`, khoá map bị biến dạng ⇒ **bug tiềm ẩn**, thêm vào RC list, chưa sửa.

Đối chiếu: chỉ `src/lib/btc/btcOwnershipResolver.ts::btcNormalizeAddress()` + hàm SQL `btc_normalize_address()`
(migration `20260823124512_…`) là **đúng** — chỉ lowercase khi khớp `^bc1[a-z0-9]+$`.

## 4. Dữ liệu đã hỏng (legacy bị lowercase) — đếm chính xác

Query toàn bộ nguồn với `addr ~ '^[13]' AND addr = lower(addr)` ⇒ **đúng 2 dòng**, cả 2 ở `profiles.btc_address`:

| username | user_id | address đang lưu (DB) | dạng |
|---|---|---|---|
| phongyknb984t341b | 7adc5b10-8733-402d-ba7e-c14887c2382b | `178qtdaz22y8mzdhgmqq6nso1467dgasvy` | P2PKH `1…` |
| angelthaihoa | d170050a-46d8-4790-9721-0e976d879338 | `3jrhcdbargfib8mjmapsm3cgxur3ev4zb1` | P2SH `3…` |

Cả 2 chuỗi này **không hợp lệ Base58Check** (chứa `0`, `1`, `l`, `o` sau khi hạ hoa; checksum khác) ⇒ không thể nhận/tra soát BTC. Chưa tìm được address gốc từ nguồn khác trong DB (2 địa chỉ này không xuất hiện ở bảng transactions/donations/aux nào).

Không có dòng nào trong `donations/transactions/wallet_transfers/profile_btc_aux_addresses` bị lowercase sai.

## 5. Kết luận (raw, không đề xuất fix)

- Data hỏng: **2 dòng**, giới hạn ở `profiles.btc_address` — root cause mới, để CTO đánh giá riêng, **không gộp RC1–RC8**.
- Code hỏng: **7 vị trí** lowercase vô điều kiện (6 ở `wallet-reconciliation-cron`, 1 ở `useWatchedWallets`).
- Chuẩn đúng đã tồn tại (`btc_normalize_address` / `btcNormalizeAddress`) nhưng chưa được dùng ở các vị trí trên.
