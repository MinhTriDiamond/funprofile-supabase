# Sub-phase E.2 — Broad flag donations theo tx_hash Class A + Export review CSV (03/07/2026)

Trạng thái: **DONE**. Không xoá row, không đổi amount/sender_id/recipient_id, không sửa view/UI/leaderboard.

---

## E.2A — Backup tx_hash seed + snapshot donations

Bảng mới trong schema `audit_btc_aux_20260703` (service_role only):

| Bảng | Nội dung | Số dòng |
|---|---|---|
| `txhash_broad_seed_a` | Mọi tx_hash BTC có liên hệ tới 77 aux Class A. Nguồn: `first_seen_tx` của aux (77) + `wallet_transfers` counterparty (14) + `transactions` from/to (14) + `donations` sender/recipient_address (7). Deduplicate. | **82** |
| `donations_broad_flag_backup` | Snapshot đầy đủ cột của các donation BTC dính bất kỳ tx_hash trong seed, trước khi cập nhật `integrity_status`. | **7** |

---

## E.2B — Broad flag

- **Query áp dụng:** `UPDATE donations SET integrity_status='suspect_aux_exchange_txhash', integrity_reason='tx_hash dính Class A aux (E.2 broad flag 03/07/2026)' WHERE token_symbol='BTC' AND integrity_status='ok' AND lower(tx_hash) IN (SELECT tx_hash FROM audit_btc_aux_20260703.txhash_broad_seed_a);`
- **Row cập nhật thực tế: 0.**
- 7 donation dính Class A **đã** ở trạng thái `suspect_aux_exchange` (từ Sub-phase E.1) → giữ nguyên, không ghi đè.

### Before / After

| Kỳ | `suspect_aux_exchange` | `suspect_aux_exchange_txhash` | Total suspect | Tổng BTC nghi ngờ |
|---|---:|---:|---:|---:|
| Trước E.2 | 7 | 0 | 7 | 0.27652925 |
| **Sau E.2** | **7** | **0** | **7** | **0.27652925** |

### Vì sao broad flag không tăng?

Sub-phase D ước tính ~393 donation "có thể" bị ảnh hưởng, nhưng con số đó lấy theo tổng donation BTC của 6 user bị dính aux — không phải bằng chứng trực tiếp.

Với dữ liệu **đang có trong DB**, ta chỉ biết một tx_hash có Class A input khi:

1. `profile_btc_aux_addresses.first_seen_tx` = tx đó (aux được học từ đó); hoặc
2. `wallet_transfers.counterparty_address` = aux (chỉ khi scanner ghi được counterparty là aux); hoặc
3. `transactions.from/to_address` = aux; hoặc
4. `donations.sender/recipient_address` = aux.

Cả 4 nguồn trên gộp lại chỉ ra **82 tx_hash**, trong đó chỉ **7 tx trùng với donation BTC**. 75 tx còn lại không liên quan tới bất kỳ donation nào (là tx ngoài mà scanner học aux từ đó).

**Nguyên nhân bản chất:** hầu hết bad donation có `sender_address` là ví thật của user, còn Class A aux chỉ nằm ở **input phụ** on-chain (thông tin cấp UTXO, không lưu trong DB). Muốn cô lập đầy đủ bad donation bằng dấu hiệu on-chain thật sự, phải **re-fetch input list của từng tx từ mempool.space** (đề xuất mở Sub-phase F).

### Top donation nghi ngờ hiện tại (7 dòng)

| tx_hash | recipient | sender | BTC |
|---|---|---|---:|
| 05a78ade04… | angelthutrang | angelkim | 0.15091506 |
| 6bd3f1f506… | angelkim | angelkim (self) | 0.079973 |
| 38d73ba1cc… | angelthutrang | angelkim | 0.04046801 |
| d01485d0e5… | angelquynhhoa | angelkim | 0.003435 |
| 525e37144f… | trogiauco | (aux) | 0.0017 |
| 072f0e2e05… | minhlanceeport | angelthuha | 0.00002595 |
| 408a60d87c… | trogiauco | (aux) | 0.00001223 |

Top người nhận bị ảnh hưởng: `angelthutrang` 0.191 BTC, `angelkim` 0.080 BTC, `angelquynhhoa` 0.003 BTC, `trogiauco` 0.0017 BTC, `minhlanceeport` 0.000026 BTC.
Top người gửi bị ghi nhận sai: `angelkim` 3 dòng, `angelthuha` 1 dòng.

### Ảnh hưởng leaderboard (ước lượng)

- Tổng BTC bị flag: **0.27652925 BTC** (~11–14K USD tuỳ giá).
- Số user chịu ảnh hưởng số liệu: **5 recipient + 2 sender**.
- Chưa chạm leaderboard SQL/view: vẫn phải quyết định ở Sub-phase F/G có loại `integrity_status<>'ok'` khỏi tính điểm hay không.

---

## E.2C — Export review CSV

Thư mục `docs/audit/btc-history-2026-07/subphase-e2/evidence/`:

| File | Số dòng | suggested_verdict | Ghi chú |
|---|---:|---|---|
| `class_B_review.csv` | 74 | needs_manual | Cha/team đánh verdict thủ công |
| `class_C_review.csv` | 113 | needs_manual | – |
| `class_D_sample_review.csv` | 50 (random) | keep | Sample để soi ngẫu nhiên; 447 aux gốc còn nguyên trong queue |
| `father_aux_review.csv` | 2 | needs_manual | 2 aux của `@father`, tách file riêng như Cha yêu cầu |

Cấu trúc CSV (theo spec Cha):

```
address, username, classification, tx_count, funded_btc,
broad_don_count, broad_don_btc,
top5_tx_hash, top5_recipients,
suggested_verdict, reviewer_verdict, reviewer_note
```

`top5_tx_hash` = 5 tx_hash gần nhất mà aux xuất hiện trong `wallet_transfers` (chain_id=0). `top5_recipients` = 5 recipient distinct trong donations dính address (nếu có). Cột `reviewer_verdict` / `reviewer_note` để trống, chờ Cha/team điền.

---

## E.2D — Rollback SQL (dán khi cần huỷ E.2)

```sql
-- 1. Gỡ nhãn broad (chưa có row nào, nhưng để sẵn nếu về sau flag thêm)
UPDATE public.donations
   SET integrity_status='ok',
       integrity_reason=NULL,
       integrity_flagged_at=NULL
 WHERE token_symbol='BTC'
   AND integrity_status='suspect_aux_exchange_txhash';

-- 2. Khôi phục từ snapshot (nếu có row cần trả lại nguyên gốc)
UPDATE public.donations d
   SET integrity_status = b.integrity_status,
       integrity_reason = b.integrity_reason,
       integrity_flagged_at = b.integrity_flagged_at
  FROM audit_btc_aux_20260703.donations_broad_flag_backup b
 WHERE d.id = b.id;

-- 3. (Tùy chọn) xoá seed và snapshot
-- DROP TABLE audit_btc_aux_20260703.txhash_broad_seed_a;
-- DROP TABLE audit_btc_aux_20260703.donations_broad_flag_backup;
```

Rollback disable Class A đã có sẵn trong `subphase-e/REPORT.md` (Sub-phase E.1).

---

## Chưa làm (đúng chỉ đạo)

- ❌ Chưa auto disable Class B (74 ví) — chờ Cha/team review CSV.
- ❌ Chưa mở broad flag cho Class B/C/D.
- ❌ Chưa đụng `@father` (2 aux vẫn `pending`).
- ❌ Chưa fix RC-1/RC-2, chưa sửa view/leaderboard, chưa sửa UI.
- ❌ Chưa hard delete bất kỳ dòng nào.

## Đề xuất bước tiếp

1. **Sub-phase F — Re-fetch inputs từ mempool.space** cho toàn bộ tx BTC của 6 user bị dính, mở rộng broad flag chính xác theo input on-chain thật. Đây là cách duy nhất mở rộng 7 → con số thực (ước lượng vài trăm).
2. **Sub-phase G** (sau khi F xong) — thiết kế bản vá RC-1/RC-2 + policy leaderboard loại `integrity_status<>'ok'`.
3. Song song, Cha/team đánh verdict trong 4 CSV E.2C; con áp vào `btc_aux_address_review_queue` khi có kết quả.
