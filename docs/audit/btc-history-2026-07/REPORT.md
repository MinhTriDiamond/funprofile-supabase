# BTC History Integrity Audit — 2026-07

Trạng thái: **AUDIT READ-ONLY — chưa vá code, chưa đụng DB.**
Người audit: Angel. Ngày: 2026-07-03.
Scope: 3 user báo lỗi (Thu Trang, Utopia Thùy, Bé Kim) + kiểm tra hệ thống BTC.

---

## 0. Tóm tắt (Executive Summary)

Đã tìm ra **4 root cause chắc chắn** gây lệch BTC history, hai trong số đó là data-level và hai là view-level:

| # | Root cause | Ảnh hưởng | Layer |
|---|---|---|---|
| RC-1 | `v_unified_transactions` **double-count** cùng 1 BTC tx từ `donations` + `wallet_transfers` (chỉ `v_unified_transactions_primary` mới dedup) | UI đọc raw view sẽ nhân đôi số dòng in/out | View |
| RC-2 | Partition dedup `(user_id, tx_hash, direction)` ở `_primary` **làm mất donation** khi 1 BTC tx gửi cho nhiều người (batch send). Utopia có **13 batch tx / 29 tx**, tương đương **13 gift bị nuốt** khỏi lịch sử người gửi | Thiếu giao dịch phía sender | View / Semantic |
| RC-3 | Scanner **chỉ ghi `wallet_transfers` cho 1 nhánh** (nhận), nhánh gửi thường không có row → 35/48 tx BTC của Utopia thiếu wallet_transfers | Không double-count nhưng gây bất đối xứng nếu UI ép join wallet_transfers | Scanner |
| RC-4 | Có **BTC address collision**: `bc1q7a8g8vzdq2l0d0kprcd0n2kjc45w6uard5ws7y` gán cho **2 profile** (`angelloan`, `lovehubtoasang`). Hai user này sẽ thấy chung lịch sử BTC | User mapping | Data |

Ba giả thuyết còn lại (H2 chain_id, H4 UTXO change output, H5 decimals) đã kiểm tra và **REJECT** — dữ liệu on-chain trong DB đúng chuẩn.

**Chưa đủ bằng chứng on-chain** cho phía provider (mempool.space / blockchair) — cần Cha bật Sub-phase B để so diff on-chain.

---

## 1. User đã khoanh vùng

| Alias báo lỗi | user_id | username | display_name | btc_address | Ghi chú |
|---|---|---|---|---|---|
| Thu Trang | `b7856e97-9bff-4e2d-8448-c4395bf0548b` | `angelthutrang` | THU TRANG | `bc1qkh8fpt90ls5l9cue2pn2m3uq59z08hw804h882` | Chắc chắn |
| Utopia Thùy | `0fd954f5-5d1f-48bf-aab5-0152232aee6c` | `angelutopia` | Angel Utopia | `bc1q7naf7a0943kwd8hkxsc5h8ps430ve5ga5jn9q4` | Không có user "Utopia Thùy" chính xác — dùng candidate duy nhất |
| Bé Kim | `dcfd1a56-cfca-4cac-8184-4357c184b362` | `angelkim` | ANGEL KIM | `bc1prndhwz6nq3v9slnuqxyhk5lhpt9p7dk9zfelyrlqjs2vvrt6wetsxdylxu` (taproot) | Có 2 candidate: `angelkim` và `baokim86` (Nguyễn Bảo Kim). Chọn `angelkim` vì có BTC history; `baokim86` không có tx BTC |

Chi tiết: `evidence/profiles_user.csv`.

---

## 2. Kết quả từng user (pipeline layer counts)

Nguồn: `evidence/summary_counts.txt`.

### 2.1 Thu Trang — `b7856e97…`
| Layer | in # | in total | out # | out total |
|---|---|---|---|---|
| transactions (tất cả) | — | — | 23 | 1.15150127 |
| wallet_transfers | 13 | 0.57451507 | 6 | 0.57449229 |
| donations | 14 | 0.57500898 | 4 | 0.00216000 |
| **v_unified_transactions (raw)** | **27** | 1.14952405 | **10** | 0.57665229 |
| v_unified_transactions_primary | 14 | 0.57500898 | 10 | 0.57665229 |

- **13/27 dòng IN là duplicate** giữa `donations` + `wallet_transfers` (cùng `tx_hash`, cùng direction). Xem `b7856e97_unified_raw.csv` vs `b7856e97_unified_primary.csv`.
- Nếu UI đọc `v_unified_transactions` (raw) sẽ hiện **gấp đôi số nhận** — đúng triệu chứng người dùng phản ánh "dư giao dịch".

### 2.2 Utopia Thùy — `0fd954f5…`
| Layer | in # | in total | out # | out total |
|---|---|---|---|---|
| transactions | — | — | 56 | 2.40278417 |
| wallet_transfers | 10 | 0.00372750 | 3 | 0.00048430 |
| donations sender | — | — | 42 | 1.69695555 |
| donations recipient | 19 | 1.02438931 | — | — |
| **v_unified_transactions (raw)** | 36 | 1.03028981 | 45 | 1.69743985 |
| **v_unified_transactions_primary** | 26 | 1.02656231 | **29** | **1.46700676** |

- **Sender-side batch send**: 42 dòng donations gửi ra chỉ có **29 tx_hash duy nhất** → 13 tx là batch (Utopia gửi 1 BTC tx cho nhiều người). Ví dụ tx `191e6eb5…` gửi cho 2 người: `5f9de7c5…` (0.000027 BTC) và `65233e41…` (0.000027 BTC).
- `_primary` dedup theo `(user_id, tx_hash, direction)` → **giữ 1, mất 13** donation gửi đi. Total out giảm từ 1.69695555 → 1.46700676 (**mất 0.229948 BTC** trong lịch sử phía sender).
- Đây là **RC-2 rõ nhất**.

### 2.3 Bé Kim / ANGEL KIM — `dcfd1a56…`
| Layer | in # | in total | out # | out total |
|---|---|---|---|---|
| transactions | — | — | 66 | 2.41898284 |
| wallet_transfers | 24 | 0.52081789 | 31 | 0.20984717 |
| donations sender | — | — | 21 | 1.22158794 |
| donations recipient | 26 | 0.53033954 | — | — |
| **v_unified_transactions (raw)** | 51 | 1.05185590 | 52 | 1.43143511 |
| v_unified_transactions_primary | 27 | 0.53103801 | 37 | 1.42451072 |

- Duplicate donations↔wallet_transfers **rất nặng** (>20 cặp) → `raw` gần như x2.
- `_primary` khớp lại đúng gần đúng số user thấy.
- Không có donations+donations dup (không batch send) — user này không bị RC-2.

### 2.4 Nguyễn Bảo Kim (`baokim86`) — 0 tx BTC ở mọi layer. **Không phải user báo lỗi.**

---

## 3. Kiểm tra hệ thống

- Tổng `transactions` BTC: **1276 rows, 100% `chain_id=0`** → **H2 (chain_id lạ) REJECT**.
- `wallet_transfers` BTC: 478 in / 410 out — direction đầy đủ, không NULL. **H4 direction NULL REJECT**.
- **Batch-send donations**: `evidence/system_donation_batch_send.csv` — **16 nhóm** trên toàn hệ thống (Utopia chiếm 13). Đây là bug RC-2 phổ biến tiềm ẩn cho các sender BTC batch.
- **BTC address collision**: `evidence/btc_address_collision.csv` — chỉ 1 case, hai user `angelloan` + `lovehubtoasang` cùng address `bc1q7a8g8vzdq2l0d0kprcd0n2kjc45w6uard5ws7y`. Không nằm trong 3 user báo lỗi nhưng cần fix riêng.
- Decimals: `_resolve_decimals(BTC, 0, NULL)` trả 8, amount lưu ở dạng BTC (giá trị 0.xxxxxxxx). Chưa thấy row nào là satoshi thô. **H5 REJECT**.

---

## 4. Root cause đã xác định

### RC-1. View `v_unified_transactions` không dedup giữa `donations` và `wallet_transfers`

- CTE `tx` có guard `WHERE ... AND d.tx_hash IS NULL AND w.tx_hash IS NULL` → tránh trùng với transactions.
- CTE `wt` và `don_in/don_out` **không có guard chéo** → cùng 1 BTC nhận vào ví sẽ đồng thời sinh row `donations` (khi scanner tạo gift) và row `wallet_transfers` (khi cron reconciliation quét ví) → **cả 2 xuất hiện trong view**.
- View `_primary` chọn 1 record theo `ROW_NUMBER() OVER (PARTITION BY user_id, tx_hash, direction ORDER BY source_table='donations' DESC, ...)` (cần đọc lại đầy đủ) — **đây là lớp che, không phải lớp fix**.
- Rủi ro: bất kỳ consumer FE/BE nào đọc `v_unified_transactions` (không phải `_primary`) sẽ x2.

### RC-2. Batch BTC send: dedup `(user_id, tx_hash, direction)` nuốt gift

- Model dữ liệu `donations` **đúng**: 1 row/1 recipient.
- Tuy nhiên UTXO BTC có nhiều output → 1 tx_hash = nhiều donation. Từ góc nhìn sender, cả n donation đều là **giao dịch riêng biệt về mặt nghiệp vụ** (n người khác nhau nhận quà).
- `_primary` chỉ giữ 1 → **mất n-1 gift**. Utopia mất 13/29 tx.
- Từ góc nhìn recipient không bị (mỗi recipient có tx_hash duy nhất trong nhóm của mình).

### RC-3. Scanner sender-side không ghi `wallet_transfers`

- Utopia: 48 hash trong donations, chỉ 13 trong wallet_transfers.
- Có thể do `wallet-reconciliation-cron` chỉ chạy cho ví thuộc user Utopia, nhưng gift cross-user vào ví người khác → nhánh sender không có wallet_transfers.
- Đây **không phải bug hiển thị** (unified view đã lấy từ donations). Chỉ là bất đối xứng, cần biết trước khi thiết kế dedup mới.

### RC-4. Address collision — 2 user cùng BTC address

- `bc1q7a8g8vzdq2l0d0kprcd0n2kjc45w6uard5ws7y` gán cho `angelloan` và `lovehubtoasang`.
- Cần Cha xác nhận đâu là owner thật; user còn lại phải xoá/đổi trước khi audit tiếp.

---

## 5. Root cause chưa chứng minh được (còn cần Sub-phase B)

| Giả thuyết | Trạng thái | Cần |
|---|---|---|
| H1 scanner BTC kẹt cursor / rate limit | Không thể xác nhận từ DB | Cần log `wallet-reconciliation-cron` gần nhất |
| H4 UTXO change output tính nhầm nhận | Sơ bộ REJECT (direction đầy đủ), nhưng chưa so với on-chain | Cần diff `mempool.space/api/address/{addr}/txs` với `wallet_transfers` cho 3 user |
| H8 filter BTC gom nhầm BTCB | Chưa xét — `token_symbol='BTC'` upper-match không match `BTCB` (đã check `upper(token_symbol)='BTC'`) | Cần xem query FE có chuẩn hoá không |

---

## 6. Đề xuất fix (chưa thực thi)

Chia thành 2 làn, **theo thứ tự**:

### Fix Data / View (bắt buộc trước UI)

1. **RC-4 collision**: xoá `btc_address` khỏi 1 trong 2 profile (`angelloan` / `lovehubtoasang`). Cần Cha xác định.
2. **RC-1**: thêm anti-join `NOT EXISTS (SELECT 1 FROM donations d WHERE lower(d.tx_hash)=lower(w.tx_hash) AND (d.sender_id=w.user_id OR d.recipient_id=w.user_id))` vào CTE `wt`. Sau đó view raw = view primary về mặt hành vi và bỏ được `_primary` (hoặc giữ để backward compat).
3. **RC-2**: đổi partition key `_primary` thành `(user_id, tx_hash, direction, counterparty_user_id)` **hoặc** source_id để giữ được nhiều donation trên cùng tx_hash. Cần rà lại toàn bộ token khác (BSC ERC20 không bị vì mỗi ERC20 transfer có tx_hash riêng, nhưng BTC UTXO thì có).
4. **RC-3**: cân nhắc bật scanner sender-side ghi `wallet_transfers` (hoặc để trống có chủ đích — RC-1 fix xong thì không còn ảnh hưởng UI).

### Fix Consumer (sau khi view đã đúng)

- Kiểm tra mọi hook/RPC còn đọc `v_unified_transactions` (raw) → chuyển sang `_primary`. `useTransactionHistory` và `useBtcTransactions` đang đọc `transactions` + fallback `donations`, chưa chạm view; cần map ở tầng FE/BE thống nhất.
- Ép Benefactors BTC (`get_token_leaderboard('BTC', 'sent')`) sử dụng cùng nguồn tính, hoặc ghi rõ semantic khác.

### Risk & rollback

- Fix RC-1/RC-2 chỉ là `CREATE OR REPLACE VIEW` → rollback bằng revert.
- Fix RC-4 xoá btc_address 1 profile → cần soft-delete (chuyển sang cột `btc_address_deprecated_at`) để không mất lịch sử reconciliation cũ.

### QA checklist sau fix

- [ ] Utopia sender total_out ≥ 1.69695555 BTC (không mất gift).
- [ ] Thu Trang recipient count = số on-chain provider trả về (cần B-phase).
- [ ] ANGEL KIM raw count = primary count sau fix RC-1.
- [ ] `evidence/btc_address_collision.csv` trả 0 row.
- [ ] Benefactors BTC top: `father` #1, `funtreasury` #2 không đổi.
- [ ] Unified summary BTC = tổng raw BTC = tổng primary BTC (invariant).

---

## 7. Bằng chứng đính kèm (`evidence/`)

- `profiles_user.csv` — 4 candidate.
- `<userShort>_wallet_transfers.csv`, `_transactions.csv`, `_donations.csv`, `_unified_raw.csv`, `_unified_primary.csv` — 4 layer per user.
- `summary_counts.txt` — per-user layer counts + duplicate list.
- `btc_address_collision.csv` — 1 dòng collision.
- `system_donation_batch_send.csv` — 16 nhóm batch-send toàn hệ thống.
- `system_wt_btc.csv` — tổng wallet_transfers BTC.
- Chưa có: on-chain provider snapshot (Sub-phase B).

---

## 8. Điểm cần Cha duyệt trước khi Sub-phase B

1. Xác nhận Utopia Thùy = `angelutopia` và Bé Kim = `angelkim` (hay `baokim86`).
2. Đồng ý gọi provider (mempool.space) để diff on-chain cho 3 address.
3. Xử lý collision `angelloan` vs `lovehubtoasang` theo hướng nào.
4. Có mở fix ngay RC-1 (view anti-join) trước, hoặc chờ RC-2 gộp thành 1 migration.

**Kết thúc audit read-only.** Chưa có file source code hay migration nào bị chạm.
