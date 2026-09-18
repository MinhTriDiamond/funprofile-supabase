# EXECUTION LOG — 23/08/2026 (ĐÃ GHI)

Duyệt: Nhóm A + Nhóm B + Bước 2. Nguồn ID: `evidence/preview_42_rows.tsv` (ghi theo ID từng dòng, KHÔNG dùng điều kiện lọc chung).

## 1. Export audit trước khi ghi

| File | Nội dung |
|---|---|
| `evidence/aud_del_tx.csv` | 26 dòng `transactions` bị DELETE (full row) |
| `evidence/aud_upd_tx.csv` | 16 dòng `transactions` bị UPDATE (full row, trạng thái TRƯỚC) |
| `evidence/aud_del_wt.csv` | 23 dòng `wallet_transfers` bị DELETE (full row) |

## 2. Đã thực thi

- **UPDATE 16 dòng** `transactions.to_address` → địa chỉ vout thật.
  - 13 dòng lấy từ `donations.recipient_address` (hash tương ứng, 1 địa chỉ duy nhất).
  - 3 dòng KHÔNG có `donations.recipient_address` (`0f01fcd9…`, `27becdda…`, `8327488411…`) → tra trực tiếp mempool.space: cả 3 có vout khớp đúng `amount` (140000 / 219000 / 57000 sat) tới `bc1pscp4ut9zqcddy6x82500cj2pdx5wnkx755s80egxgcs6f3p5fu3qffxlrd` → dùng địa chỉ này.
- **DELETE 26 dòng** `transactions` (nhóm A, `user_id = father`).
- **DELETE 23 dòng** `wallet_transfers` (`user_id = father`, thuộc 28 hash sai).
- Không đổi `amount`, `tx_hash`, `token_symbol`, `created_at`, `user_id`. Không đụng `donations`.

## 3. Verify sau khi ghi (raw query)

| Chỉ số | Trước | Sau | Kỳ vọng |
|---|---|---|---|
| `transactions` có `to_address` = ví Cha | 58 | **16** | 15 thật + 1 orphan = 16 ✓ |
| 26 ID nhóm A còn tồn tại | 26 | **0** | 0 ✓ |
| 16 ID nhóm B đã đổi địa chỉ | 0 | **16** | 16 ✓ |
| `wallet_transfers` user_id = Cha | 62 | **39** | 62 − 23 = 39 ✓ |
| Leaderboard BTC (Cha gửi) | 12 dòng / $705.918,56 | **12 / $705.918,56** | KHÔNG đổi ✓ |
| `donations` Cha nhận (confirmed) | 611 / $2.116.276,14 | **611 / $2.116.276,14** | KHÔNG đổi ✓ |

## 4–6. Câu hỏi bắt buộc — `wallet-reconciliation-cron`

**Kết luận: ĐÃ ĐƯỢC VÁ. Không còn rủi ro sống.**

RAW code hiện hành (`supabase/functions/wallet-reconciliation-cron/index.ts`, dòng 137–150):

```ts
  const { data: btcAux } = await supabase
    .from("profile_btc_aux_addresses")
    .select("user_id, address, verified")
    .eq("verified", true)          // <-- gate verified
    .limit(5000);
  ...
  const btcMap = new Map<string, string>(); // address -> user_id
  for (const p of btcOwners ?? []) if (p.btc_address) btcMap.set(p.btc_address.toLowerCase(), p.id);
  for (const a of btcAux ?? []) if (a.address) btcMap.set(a.address.toLowerCase(), a.user_id);
```

- **Thời điểm vá:** commit `ebc11eee6` ngày **21/06/2026** (commit duy nhất thêm điều kiện `verified` vào file này) — cùng đợt dọn 813 aux address gán sai cho Cha.
- **Trạng thái hôm nay:** `profile_btc_aux_addresses` có **1.706 dòng `verified = false`** và **1 dòng `verified = true`** ⇒ nhánh aux của cron hiện chỉ resolve qua đúng 1 địa chỉ đã xác minh. Cron chạy 30′/lần nhưng **không thể** sinh thêm dòng sai kiểu này ⇒ **không cần khoá thêm flag** (không lặp lại cơ chế `btc_manual_confirm`).
- **Các scanner ghi khác cũng đã có gate:** `scan-btc-transactions` (dòng 209) và `btc-history-repair` (dòng 95–96) đều `.eq("verified", true)`. `btc-wallet-audit` không lọc nhưng **read-only** (audit); `btc-ownership-reverify` chính là hàm cấp `verified`.
- **Phạm vi hậu quả:** 49 dòng vừa dọn (26 + 23) đều thuộc **28 hash tháng 04/2026**, nằm trước mốc vá 21/06/2026. Toàn bộ dòng `to_address` = ví Cha còn lại là 16 (15 thật + 1 orphan `92b63665…` đã có kết luận riêng, đang đếm ngược 30 ngày) ⇒ **không còn khoảng thời gian nào chưa được xét** cho riêng ví Cha. Nếu muốn chắc chắn toàn hệ thống, việc mở rộng là quét cùng pattern cho các ví khác (chưa làm, không thuộc phạm vi nhánh này).
