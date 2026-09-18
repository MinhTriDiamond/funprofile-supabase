# RC-Code Trace — G1 (read-only code walk-through)

> Đường đi trong code hiện tại làm sinh ra mỗi RC-code. G1 không sửa, chỉ ghi nhận để G2 fix.

## RC-10 — hd_input_back học nhầm ví exchange
- **Điểm phát sinh:** `supabase/functions/scan-btc-transactions/index.ts` — logic auto-học aux từ input của tx OUT.
- **Quyết định sai:** Bất kỳ input nào không map user hiện có đều bị coi là aux của sender_user hiện tại.
- **Đã freeze:** Sub-phase D. Vẫn còn 634 record active nhưng chỉ 447 D_likely_valid được tin ở G1.

## RC-11 — Double attribution
- **Điểm phát sinh:** Scanner chèn `donations` với dedup theo `(tx_hash, recipient_id)` — không có `vout_index`.
- **Quyết định sai:** Khi 1 tx có nhiều vout thuộc cùng recipient, hoặc scanner chạy lại và match nhầm vout khác, sinh row trùng.
- **Fix (G3):** Chuyển unique key sang `(tx_hash, vout_index, recipient_address)`. Bảng `donations` cần thêm cột `vout_index`.

## RC-12 — chain_family mismatch
- **Điểm phát sinh:** `scan-btc-transactions` (hoặc scanner EVM tràn qua) — chèn donation với `chain_family='evm'` cho `tx_hash` là hash BTC (64 hex, không có prefix `0x`).
- **Quyết định sai:** Không validate `tx_hash` format trước khi assign chain_family.
- **Fix (G3):** Ép chain_family theo pattern (`0x…` = evm, `^[0-9a-f]{64}$` = bitcoin). Migration backfill 27 row.

## RC-13 — Batch output missing
- **Điểm phát sinh:** `scan-btc-transactions` chỉ tạo donation cho vout đầu tiên khớp recipient, bỏ qua các vout còn lại.
- **Quyết định sai:** Vòng lặp break sau khi tìm được 1 match, không iterate hết vout array.
- **Fix (G3):** Iterate toàn bộ vout, tạo `(tx_hash, vout_index)` cho mỗi vout thoả rule donation.

## RC-15 — is_external wrong
- **Điểm phát sinh:** Scanner set `is_external=true` khi `sender_address` không có trong `custodial_wallets` (chỉ check custodial, không check profiles.btc_address hoặc aux).
- **Quyết định sai:** Bỏ qua ownership resolver §2 — chỉ dựa vào custodial table.
- **Fix (G3):** `is_external = (sender_user IS NULL) OR (recipient_user IS NULL)`.

## RC-16 — Coinjoin attributed
- **Điểm phát sinh:** Scanner không check `|SenderUsers|` trước khi gán sender.
- **Quyết định sai:** Gán sender = owner của vin[0] (input đầu tiên) bất kể có multi-owner.
- **Fix (G3):** Nếu `|SenderUsers| > 1` → đưa vào `btc_review_queue`, không tạo donation.

## RC-17 — Change as recipient
- **Điểm phát sinh:** Scanner không phân biệt change output vs recipient output — nếu address change tình cờ khớp aux của user khác thì bị tạo donation.
- **Quyết định sai:** Không apply change detection rule (§4).
- **Fix (G3):** Rule per-output classification §4.

## Điểm consumer đang đọc lệch
- `src/hooks/useWalletHistory.ts` — đọc EVM only, không đọc BTC.
- `src/hooks/usePublicDonationHistory.ts` — join `profile_btc_aux_addresses` để lookup counterparty, nhưng vẫn đọc `donations` gốc (nên bị nhiễm RC-10/11/13/15).
- Trigger `trg_sync_donation_to_transactions`, `trg_sync_wallet_transfer_to_transactions` — sync bug forward vào `transactions`.
- RPC `backfill_transactions_from_sources` — cũng propagate lỗi.

Tất cả các consumer trên **sẽ đọc chung view `v_btc_history`** sau khi G3 rebuild (xem SPEC §10).
