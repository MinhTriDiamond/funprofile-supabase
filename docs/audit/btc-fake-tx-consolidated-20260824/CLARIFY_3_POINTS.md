# VIỆC 2 — Làm rõ 3 điểm treo từ báo cáo 18 TX (24/08/2026, chỉ đọc)

## 1. Đơn vị đếm "aux unverified" — KHÁC đơn vị với "dòng donation"

`aux unverified` đếm **địa chỉ BTC phụ (row trong `profile_btc_aux_addresses`)**, KHÔNG phải dòng donation. Mỗi địa chỉ là duy nhất (`UNIQUE(address)`), 1 địa chỉ có thể xuất hiện trong 0, 1 hay nhiều donation.

RAW:
```
     username     | rows_total | distinct_addr | unverified | disabled
------------------+------------+---------------+------------+---------
 angelkim         |        546 |           546 |        546 |      10
 angelthuha       |        340 |           340 |        340 |      26
 angelthienhanh68 |         42 |            42 |         42 |       0
 angelutopia      |         34 |            34 |         34 |       0
 angelgiau        |         11 |            11 |         11 |       0
 angelqueanh      |          7 |            7 |          7 |       0

-- số dòng donations BTC (mọi vai trò) của cùng nhóm
 angelutopia 61 | angelkim 48 | angelthuha 45 | angelgiau 36 | angelqueanh 26 | angelthienhanh68 23
```
⇒ 546 (địa chỉ) vs 48 (dòng donation) **không mâu thuẫn, không nhầm đơn vị**: scanner auto-learn sinh 1 địa chỉ change cho mỗi output nó suy đoán, đa số chưa từng khớp donation nào. `rows_total = distinct_addr` ở cả 6 user ⇒ không có địa chỉ nhân bản.

## 2. 50 dòng `transactions` — dedup THEO THIẾT KẾ, không phải gap M6B mới

RAW:
```
-- transactions cho 18 txid
 tx_rows | txids
      50 |    18     (2–4 dòng/tx; 1da80ffa, 2f38060e, 4e6fdcc8 = 4 dòng)

-- v_unified_transactions cho cùng 18 txid, theo nguồn
   source_table   | count
 donations        |    57
 wallet_transfers |     5
 transactions     |     0
```
Định nghĩa view (`pg_get_viewdef`) nhánh `transactions`:
```
FROM transactions t
  LEFT JOIN donations d ON lower(d.tx_hash)=lower(t.tx_hash) AND d.chain_id=t.chain_id
  LEFT JOIN wallet_transfers w ON lower(w.tx_hash)=lower(t.tx_hash) AND w.chain_id=t.chain_id AND w.user_id=t.user_id
```
⇒ dòng `transactions` bị loại khi đã có donations/wallet_transfers cùng `tx_hash` + `chain_id`. Cả 18 txid đều có donations ⇒ **50/50 dòng bị dedup có chủ đích**, không có dòng nào "lọt sổ".

Khác biệt với gap M6B (50/912 dòng): gap M6B là các dòng **không có** bản ghi donations/wallet_transfers đối ứng nhưng vẫn bị view bỏ (direction/chain_id lệch). Ở đây ngược lại: có đối ứng nên bị dedup đúng. ⇒ **KHÔNG phải gap mới, cũng KHÔNG nằm trong phạm vi 50/912 của M6B.**
Ghi chú số: báo cáo trước ghi "51 dòng", đếm lại chính xác là **50 dòng**.

## 3. angelquynhhoa — gắn với TX #5 (`4e6fdcc8…`), vai trò **NHẬN**

RAW:
```
donation b888ef98-0493-4a44-8a42-6e7aa96f7937
  tx 4e6fdcc8 | sender angelgiau → recipient angelquynhhoa | 0.00300000 BTC | $206.96
  status=confirmed | is_external=true | leaderboard_eligibility=external_excluded

on-chain 4e6fdcc8 vout0 = bc1qq7cjcc7q682ccruv0ssh4pldn9wy7vnuh2eq07 · 0.003 BTC
profiles.btc_address(angelquynhhoa) = bc1qq7cjcc7q682ccruv0ssh4pldn9wy7vnuh2eq07  ⇒ KHỚP
```
⇒ Đầu **nhận** của angelquynhhoa là địa chỉ khai báo thật, khớp vout0 on-chain. Không nghi vấn ở đầu nhận; nghi vấn còn lại là **đầu gửi** (DB gán angelgiau, còn vin thật là `bc1qvffzpp8…0gsr` — aux unverified của stub `wallet_0x50ebe82ce05adf3dd`). Dòng này đang `external_excluded` ⇒ không hiển thị trên BXH.
