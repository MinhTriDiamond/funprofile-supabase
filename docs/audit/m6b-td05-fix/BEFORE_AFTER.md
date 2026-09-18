# M6B-1 · Before / After Report — Dedup `transactions` trong `v_unified_transactions`

Ngày: 2026-07-01 · Chế độ: **Read-only** (chưa apply migration).

---

## 0. Phát hiện chính (thay đổi so với `td05_verdict.md`)

Sau khi dump SQL thực tế của cả 2 view:

| View | Có dedup không | Consumer |
|---|---|---|
| `v_unified_transactions` (raw) | ❌ KHÔNG dedup — UNION tất cả 4 nhánh | `get_unified_transaction_detail` (chỉ đọc theo `tx_hash` cụ thể, không aggregate) + `GRANT anon` public |
| `v_unified_transactions_primary` | ✅ dedup bằng `row_number() PARTITION BY (user_id, lower(tx_hash))` — priority `donations > wallet_transfers > transactions` | Toàn bộ RPC production: `get_unified_transactions`, `get_unified_summary`, `get_unified_counterparties`, `get_unified_transaction_detail` |

⇒ **Vietnamese finding**: Consumer chính đã đúng nhờ view `_primary`. Nhưng **raw view vẫn LỘ ra ngoài** cho `authenticated + anon` và bị 1 RPC dùng — nếu bất kỳ hook FE hay bên thứ ba nào query trực tiếp → double-count.

⇒ TD-05 severity thực tế: **P1** (không phải P0). Nhưng vẫn cần fix vì:
1. Raw view có row `transactions` cực nhiều (55K), 98% trùng.
2. Semantics view không nhất quán — `v_unified_transactions` bị "tin nhầm" là bảng dữ liệu.
3. `swap_transactions` KHÔNG có trong cả 2 view → thiếu 46 swap khỏi Unified History.

---

## 1. Row count hiện tại theo `source_table`

```
 source_table    | count 
-----------------+-------
 transactions    | 55335
 donations       | 54431
 wallet_transfers|  2161
 (swap_transactions) | 0  ← chưa được UNION
--------------------------
 TOTAL            111927
```

## 2. Phân loại 55 335 row của `transactions`

```
 category                    | row_count 
-----------------------------+-----------
 camly_claim_or_gift         |     39376
 reconciliation_bep20_usdt   |      8755
 reconciliation_bnb          |      2997
 other (FUN testnet chủ yếu) |      2932
 reconciliation_btc          |      1275
```

## 3. Overlap giữa `transactions` và các bảng khác

```
 total_tx |  duplicated_with_donations | duplicated_with_wallet_transfers | duplicated_with_both 
----------+----------------------------+----------------------------------+----------------------
    55335 |                      54418 |                             2157 |                 1859
```

⇒ **98.3 %** row trong `transactions` **đã có** ở `donations` (cùng `tx_hash + chain_id`). Đây là các dòng do scanner ghi song song vào cả 2 bảng (mem `transaction-history-backfill-policy` xác nhận).

## 4. Simulate filter + dedup đề xuất

Áp dụng cùng logic trong migration draft (whitelist reconciliation + NOT EXISTS):

```
 total_tx | after_whitelist | after_dedup 
----------+-----------------+-------------
    55335 |           13027 |         590
```

Phân loại 590 row còn lại (giữ lại đúng nghĩa "reconciliation độc lập"):

```
 category                    | count 
-----------------------------+-------
 reconciliation_bnb          |   299
 reconciliation_bep20_usdt   |   269
 reconciliation_btc          |    22
```

**Kết quả:** view sẽ chuyển từ **111 927 → 57 182 row** (giảm 54 745 = 48.9%).

## 5. Sample 20 tx_hash bị **LOẠI** (đã có trong donations)

Xem `docs/audit/m6b-td05-fix/sample_removed_dup_with_donations.txt`.  
Snapshot 5 dòng đầu:

```
tx_hash_short          | chain_id | token | status    | date
-----------------------+----------+-------+-----------+-----
0xd56bc262a08e4b02a2ae | 56       | BNB   | confirmed | 2026-06-30
0xd69a1de8a36868f6a1ba | 56       | BNB   | confirmed | 2026-06-30
0xfee219dc5af...       | 56       | BNB   | confirmed | 2026-06-27
...
```

⇒ Đã verify các `tx_hash` này đều tồn tại trong `donations` với cùng `chain_id` → chắc chắn bị loại đúng.

## 6. Sample 20 tx_hash **CÒN LẠI**

Xem `docs/audit/m6b-td05-fix/sample_kept_reconciliation.txt` (BNB / USDT / BTC on-chain, không có bản đối ứng ở donations/wallet_transfers → giữ đúng).

## 7. `other` — 2 932 row (không thuộc whitelist)

```
 token_symbol | chain_id | status    | count 
--------------+----------+-----------+-------
 FUN          |       97 | confirmed |  2894
 BNB          |       97 | confirmed |    20
 BTCB         |       56 | confirmed |    11
 CAMLY        |       97 | confirmed |     2
 BNB          |        0 | confirmed |     2
 TONCOIN      |       56 | confirmed |     2
 CAMLY        |      137 | confirmed |     1
```

Chủ yếu FUN testnet (chain 97). Bé đề nghị **không** thêm vào whitelist ở giai đoạn này — testnet không nên hiển thị trên Unified History production. Chờ Cha xác nhận.

## 8. Migration draft (CHƯA APPLY)

Xem `docs/audit/m6b-td05-fix/DRAFT_VIEW_MIGRATION.sql`.

Nội dung chính:
- `CREATE OR REPLACE VIEW public.v_unified_transactions` với CTE `tx` được siết như spec.
- Thêm CTE thứ 5 `sw` cho `swap_transactions` (2 row/swap: out + in) — chuẩn bị cho M6B-2.
- Giữ nguyên `v_unified_transactions_primary` (nó sẽ tự dedup phần swap qua row_number).

## 9. Rủi ro / rollback

| Rủi ro | Mitigation |
|---|---|
| Consumer external đang đọc raw view và trông đợi 111K row | Trước khi apply, `REVOKE SELECT … FROM anon` để lock raw view + confirm không có FE nào query trực tiếp (đã grep, không có). |
| Swap 2 row/swap có thể phá tổng token cũ | Chưa apply cho tới M6B-2 duyệt. |
| Testnet FUN 2894 row biến mất khỏi view | Không hiển thị production — chấp nhận. |

Rollback: `CREATE OR REPLACE VIEW` reversible bằng migration cũ (`20260630173340`).

## 10. Chờ Cha duyệt

Bé chưa apply. Đợi Cha đọc file này + `DRAFT_VIEW_MIGRATION.sql` rồi ra lệnh.
