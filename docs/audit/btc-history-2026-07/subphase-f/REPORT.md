# Sub-phase F — BTC On-chain Input Re-fetch Audit (03/07/2026)

Trạng thái: **DONE**. Không xoá row, không sửa view/UI/leaderboard, không đổi amount/sender/recipient.

Mục tiêu: dùng dữ liệu input-level UTXO thật từ `mempool.space` để kiểm chứng lại giả thuyết "còn nhiều donation BTC dính Class A ẩn trong input phụ" mà E.2 (chỉ nhìn DB) không thấy được.

---

## F1 — Backup

- Danh sách tx sẽ fetch: `evidence/tx_candidates.txt` (325 tx_hash).
- Snapshot donations BTC của 6 impacted users trước khi cân nhắc flag: `evidence/donations_btc_snapshot.psv` (534 dòng, gồm cả donation không thuộc 6 user để đối chiếu).
- Raw JSON của 7 tx dính Class A: `evidence/raw_hits/` (7 file, mỗi file là response `/api/tx/{txid}` từ mempool.space).
- Backup schema `audit_btc_aux_20260703` (từ E.1/E.2) vẫn còn nguyên; không tạo thêm bảng ở schema đó vì Sub-phase F **không update** dòng nào trong `public.donations`.

## F2 — Build tx candidate set (325 tx)

Nguồn (dedup, chỉ giữ hash 64 hex, loại `btc-manual-*`):

| Nguồn | Ghi chú |
|---|---|
| `donations` BTC (sender_id ∈ 6 impacted OR recipient_id ∈ 6 impacted) | |
| `wallet_transfers` (chain_id=0, user_id ∈ 6 impacted) | |
| Seed E.2 (`first_seen_tx` của 77 aux Class A + counterparty aux Class A trong `wallet_transfers` + `donations.sender/recipient_address` = Class A) | |
| **Tổng dedup** | **325 tx** |

## F3 — Fetch on-chain

- Endpoint: `GET https://mempool.space/api/tx/{txid}`.
- Concurrency 4, retry/backoff 4 lần, timeout 30s, cache raw JSON tại `/tmp/subf/raw/{txid}.json`.
- **Fetch errors: 0/325** (`evidence/fetch_errors.csv` header only).
- Với mỗi tx, extract `inputs` = `set(vin[].prevout.scriptpubkey_address)`, `outputs` = `list(vout[].scriptpubkey_address, value)`.

### Address reference sets

| Set | Size | Nguồn |
|---|---:|---|
| Class A (exchange/hot certain) | 77 | `profile_btc_aux_addresses.classification='A_exchange_certain'` |
| Class B (suspect high) | 74 | `classification='B_suspect_high'` |
| Disabled aux (đã disable E.1) | 77 | `disabled_at IS NOT NULL` (trùng Class A) |
| Valid aux (all aux − A − B) | 1 556 | Kỳ vọng thuộc user thật |
| User main BTC (`profiles.btc_address` + `btc_addresses`) | 110 | Ví chính đã bind |

### Kết quả classification 325 tx

| Chỉ số | Số tx |
|---|---:|
| Có ít nhất 1 input Class A | **82** |
| Có ít nhất 1 input Class B | 16 |
| Có input `disabled` (=Class A) | 82 |
| Không dính Class A/B | 227 |

File chi tiết: `evidence/tx_classified.csv` (325 dòng, cột `has_A/has_B/has_disabled/n_inputs/n_outputs/A_hits/B_hits`).

## F4 — Flag rule + kết quả

Rule như Cha duyệt:

```
FLAG khi:
  token_symbol='BTC'
  AND tx.has_class_A_input
  AND donation.sender_id đã bị gán Class A aux
  AND on-chain KHÔNG có input nào thuộc {main + valid_aux} của sender
  AND integrity_status='ok' (không ghi đè suspect đã có)
```

### Kết quả

| Chỉ số | Giá trị |
|---|---:|
| Donations BTC nằm trong 325 tx đã fetch | 210 |
| Donations BTC có tx với input Class A | **7** |
| Trong đó đã ở `suspect_aux_exchange` (E.1) | **7** |
| **Donation mới cần flag (F)** | **0** |
| **Tổng BTC mới bị flag (F)** | **0.00000000** |
| Class B candidate (chưa flag, chờ review) | 5 |
| Ambiguous | 0 |

### So sánh before/after

| Kỳ | `suspect_aux_exchange` | `suspect_aux_exchange_txhash` | `suspect_aux_exchange_onchain` | Total suspect |
|---|---:|---:|---:|---:|
| Trước F (sau E.2) | 7 | 0 | 0 | 7 |
| **Sau F** | **7** | **0** | **0** | **7** |

## 7 donation dính Class A (giữ nguyên trạng thái)

| tx_hash | recipient | sender | BTC | Class A input hit |
|---|---|---|---:|---|
| 05a78ade04… | angelthutrang | angelkim | 0.15091506 | `bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h` |
| 6bd3f1f506… | angelkim | (aux Class A) | 0.079973 | idem |
| 38d73ba1cc… | angelthutrang | angelkim | 0.04046801 | idem |
| d01485d0e5… | angelquynhhoa | angelkim | 0.003435 | idem |
| 525e37144f… | trogiauco | (aux) | 0.0017 | Class A input khác |
| 072f0e2e05… | minhlanceeport | angelthuha | 0.00002595 | Class A |
| 408a60d87c… | trogiauco | (aux) | 0.00001223 | Class A |

Top recipient bị ảnh hưởng: `angelthutrang` 0.191 BTC, `angelkim` 0.080 BTC, `angelquynhhoa` 0.003 BTC, `trogiauco` 0.00171 BTC, `minhlanceeport` 0.000026 BTC.
Top sender bị ghi nhận sai: `angelkim` 3 dòng, `angelthuha` 1 dòng, còn lại là aux Class A trực tiếp.

## Kết luận quan trọng — bằng chứng on-chain

Sub-phase D ước tính ~393 donation "có thể" sai (theo tổng donation BTC của 6 impacted users, chưa có bằng chứng on-chain). Sub-phase F **chứng minh trực tiếp** từ mempool.space:

1. Trong 325 tx liên quan tới 6 impacted user, **chỉ 82 tx** có input dính Class A — và 75 tx trong số đó là **tx của chính exchange** (được scanner học aux từ `first_seen_tx`), **không phát sinh** donation nào trong hệ thống.
2. Chỉ **7 donation BTC** thực sự đến từ tx có Class A input — trùng khớp 100% với 7 dòng E.1 đã flag bằng exact-match `sender_address`.
3. Với 5 donation Class B input (`class_b_candidates.csv`), phần lớn là chuyển tới ví treasury `bc1qrq0v066l2nkp7mh4lmza2szmpfkawfx4kdn48j` của `@edb32940…` (nhìn có vẻ hợp lệ, không có dấu hiệu exchange input). **Không auto flag**, giữ ở dạng candidate review.
4. Ước lượng "393 donation cần flag" ở Sub-phase D **không được on-chain data ủng hộ**. Con số đúng theo bằng chứng UTXO input hiện tại: **7**.

⇒ E.1 đã cô lập xong phần donation BTC bị ô nhiễm bởi Class A. Không cần mở rộng flag thêm ở tầng donation.

## Class B candidate (5 dòng, chưa flag)

| tx_hash | recipient | sender | BTC | Ghi chú |
|---|---|---|---:|---|
| aad8a03279… | @edb32940… | father | 5.00000000 | Class B input, nhưng nhận là treasury nội bộ. |
| 8ebc4a6ba4… | @edb32940… | angelanhnguyet | 0.05000000 | idem |
| 69bab3bdf4… | @edb32940… | father | 0.00080000 | idem |
| f9e06e109b… | trogiauco | – | 0.0001694 | Không xác định sender |
| 0a26fce670… | @edb32940… | angelanhnguyet | 0.00010000 | idem |

Chưa auto flag — chờ Cha/team đánh verdict CSV Class B (đã export ở E.2).

## Tx vẫn ambiguous

Không có tx nào ambiguous theo rule F (0 dòng). Lý do: chỉ 7 tx có Class A input và cả 7 đã ở `suspect_aux_exchange`. Không có case sender_id trống + Class A input mà chưa xử.

## Rollback SQL

Sub-phase F **không update** dòng nào ở `public.donations`, nên không cần rollback DB. Nếu về sau muốn xóa hoàn toàn evidence F:

```bash
rm -rf docs/audit/btc-history-2026-07/subphase-f/
```

Rollback E.1/E.2 vẫn dùng khối SQL đã có trong `subphase-e/REPORT.md` và `subphase-e2/REPORT.md`.

## Chưa làm (đúng chỉ đạo Cha)

- ❌ Chưa fix RC-1/RC-2.
- ❌ Chưa sửa view/leaderboard.
- ❌ Chưa sửa UI.
- ❌ Chưa auto disable Class B.
- ❌ Chưa hard delete.

## Đề xuất bước tiếp

Bằng chứng on-chain đã đủ để mở **Sub-phase G — Policy & Leaderboard patch**:

1. Confirm 7 donation dính Class A là "final scope" của incident.
2. Fix RC-1 (aux discovery gate) + RC-2 (address canonicalization) — nay đã an toàn vì nguồn BTC đã cô lập xong.
3. Cập nhật view/leaderboard loại `integrity_status <> 'ok'` khỏi tính điểm.
4. Cha/team hoàn tất verdict CSV cho Class B/C/D + 2 aux `@father` (dùng file ở `subphase-e2/evidence/`).
