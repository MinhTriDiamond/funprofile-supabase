# BTC Semantic Specification (Draft SSOT v0.1)

> Sub-phase G1 — audit + spec only. Không code, không migration.
> Đây là bản draft chờ Cha duyệt trước khi mở G2/G3.

## 0. Nguyên tắc gốc

**Do not infer human intent from input ownership alone.**
Chỉ vì user A sở hữu một input trong Bitcoin transaction KHÔNG có nghĩa là A đã "tặng" tất cả các output.
Ownership của input chỉ cho biết "ai có thể đang chi", còn từng output phải được phân loại riêng qua rule
change / batch / internal / external / treasury.

## 1. Entity

| Entity | Định nghĩa |
|---|---|
| `btc_transaction` | 1 tx trên chain BTC, xác định bằng `tx_hash` (32-byte). Nguồn sự thật duy nhất = raw JSON từ mempool.space / esplora. |
| `btc_flow` | Dòng tiền per-address: `(tx_hash, address, direction, value_sat)`. Direction = `in` (là vin) hoặc `out` (là vout). |
| `btc_donation` | Diễn giải cấp cao: `(tx_hash, vout_index, sender_user, recipient_user, amount_sat)`. Chỉ tồn tại khi output đó thoả rule "donation" (mục §4). |
| `btc_transfer` | Wallet-transfer nội bộ (self-move, exchange withdrawal, treasury flow) — không sinh donation, chỉ ghi lịch sử ví. |
| `btc_history_row` | Row hiển thị trong UI/History — luôn được **derive** từ `btc_donation` + `btc_transfer` + `btc_flow`, không lưu tách rời. |

## 2. Ownership resolution

`address → user_id?` được resolve theo thứ tự ưu tiên:

1. **primary**: `profiles.btc_address` (1 địa chỉ / user).
2. **hd_change_auto**: địa chỉ change được scanner phát hiện trong lần OUT hợp lệ trước đó.
3. **manual**: admin thêm bằng tay (rất hiếm).
4. **hd_input_back** (LEGACY, đang FREEZE): auto học từ input của tx OUT — chỉ tin nếu classification = `D_likely_valid`. Class A/B/C: KHÔNG tin.
5. Không rơi vào 4 nhóm trên → **external** (không map user).

Father / treasury / validator: được đánh dấu bằng cột riêng (`profiles.role='treasury'` hoặc bảng riêng),
resolver KHÔNG được auto-học aux cho các entity này (special case, xem §6).

## 3. Chuẩn hoá UTXO → flow

Cho tx `T`:
- `V_in = { (addr_i, value_i) }` từ mọi `vin[].prevout`.
- `V_out = { (idx_j, addr_j, value_j) }` từ mọi `vout` không phải `op_return`.
- `fee = Σ V_in.value - Σ V_out.value`.
- `owner_of(addr)`: dùng resolver §2.

`SenderUsers(T) = { owner_of(a) | (a, _) ∈ V_in, owner_of(a) ≠ external }`.

## 4. Rule matrix (per-output classification)

Cho mỗi `vout j` trong `T`:

| Điều kiện | `kind` | Ghi donation? |
|---|---|---|
| `scriptpubkey_type == op_return` | `op_return` | Không |
| `|SenderUsers| > 1` (coinjoin/co-input) | `ambiguous` | KHÔNG — đưa tx vào `needs_review` |
| `|SenderUsers| == 1 = {U}` VÀ `owner_of(addr_j) == U` VÀ mọi vout khác cũng thuộc `U` | `internal_move` | Không (chỉ ghi transfer) |
| `|SenderUsers| == 1 = {U}` VÀ `owner_of(addr_j) == U` (có vout khác không thuộc U) | `change` | Không |
| `|SenderUsers| == 1 = {U}` VÀ `owner_of(addr_j) = V ≠ U` VÀ V ≠ external | `donation` | **Có** — sender=U, recipient=V, amount=value_j |
| `|SenderUsers| == 1 = {U}` VÀ `owner_of(addr_j) = external` | `external_out` | Không (ghi wallet_transfers.OUT của U) |
| `|SenderUsers| == 0` (external sender) VÀ `owner_of(addr_j) = V ≠ external` | `external_donation` | Ghi donation với `sender_user=NULL`, `is_external=true`, `sender_address = majority-value vin addr` |

## 5. Amount rule

**`donation.amount = value của chính vout đó`**, tuyệt đối KHÔNG dùng `Σ V_out` hay `Σ V_in`.

## 6. Special cases

### 6.1 Father / treasury flow
Nếu `SenderUsers = {father}` VÀ có ≥3 vout donation cùng lúc → gắn tag `treasury_payout`.
UI hiển thị "Father chi treasury cho N recipient", KHÔNG ghép thành N gift-celebration post.
Rule aux discovery cho father: **disable auto**, chỉ manual.

### 6.2 Exchange withdrawal
Nếu `owner_of(vin_majority)` = một địa chỉ đã bị disable với `classification='A_exchange_certain'` → tx được đánh dấu
`external_from_exchange`, sender_user = NULL. KHÔNG được attribute cho user chỉ vì hd_input_back từng học nhầm.

### 6.3 Self transfer (change-to-self)
Xem §4 dòng `internal_move`. Ghi 1 row `wallet_transfers` `direction='internal'`, KHÔNG sinh donation.

### 6.4 Coinjoin
`|SenderUsers| > 1` → tx đi vào `btc_review_queue`, không auto attribution. Cần verdict thủ công.

## 7. Idempotency

**Key duy nhất cho `btc_donation` = `(tx_hash, vout_index, recipient_address)`.**
Chỉ dùng `tx_hash` là sai (đã tạo RC-11 double_attribution).

**Key cho `btc_flow` = `(tx_hash, address, direction)`**.

## 8. `is_external`

`is_external = TRUE` khi và chỉ khi:
- `sender_user IS NULL` (không owner nội bộ nào ở vin), HOẶC
- `recipient_user IS NULL` (vout đích không map user nội bộ).

Nếu cả sender_user và recipient_user đều là user nội bộ đã verify → `is_external = FALSE` bắt buộc.
Không có "external half" — nếu 1 phía external thì cả row = external.

## 9. Ambiguous handling

Mọi tx không thoả rule (coinjoin, address không parse được, fetch failed, ownership mâu thuẫn):
- KHÔNG guess, KHÔNG attribute.
- Ghi `integrity_status='needs_review'`, `integrity_reason=<code>`.
- Đưa vào `btc_review_queue`.

## 10. SSOT consumers

Wallet, Benefactors, Treasury, Export CSV, Dashboard, Public Profile History — tất cả đọc chung 1 view
`v_btc_history` derive từ `btc_donation` + `btc_transfer` + `btc_flow`.
KHÔNG được đọc trực tiếp `donations`/`wallet_transfers` cho BTC nữa (mỗi nơi hiểu 1 kiểu = incident hôm nay).

## 11. Root Cause codes (evidence-backed)

Chỉ liệt kê RC-code có evidence thật từ 3 user trọng tâm (xem `semantic_diff.csv`).

| Code | Định nghĩa | Ví dụ evidence |
|---|---|---|
| **RC-10** | hd_input_back học nhầm ví exchange (đã cô lập trong E.1/F). | 7 donation flagged. |
| **RC-11** | `double_attribution`: 1 tx sinh >1 donation cho cùng recipient do idempotency chỉ theo `tx_hash`. | tx `2f38060e…` sinh 2 donation cho angelgiau (ảnh Cha). 28 rows. |
| **RC-12** | `chain_family_mismatch`: `donations.chain_family='evm'` nhưng `tx_hash` là BTC (64 hex, không phải 0x-prefix EVM). | tx `0115b9ef…` angelgiau→angelutopia 0.002 BTC bị đánh EVM. 27 rows. |
| **RC-13** | `batch_output_missing`: on-chain có N donation vouts hợp lệ, DB chỉ có M<N rows. | tx `6bd3f1f5…` có 4 vout thuộc angelkim, DB thiếu 4 row. 53 expected rows thiếu. |
| **RC-15** | `is_external_wrong`: cả sender và recipient đều là user nội bộ đã verify nhưng `is_external=true`. | tx `05a78ade…` angelkim(vin bc1qm34l…)→angelthutrang(vout bc1qkh8f…) bị đánh external. 62 rows. |
| **RC-16** | `coinjoin_attributed`: `|SenderUsers|>1` mà DB vẫn gán 1 sender. | tx `1da80ffa…` (angelthienhanh68 & angelutopia cùng input) → DB gán angelthienhanh68 tặng 0.907 BTC cho angelutopia (thực chất là internal move + coinjoin). 3 rows. |
| **RC-17** | `change_as_recipient`: recipient_address trong DB là change output của chính sender. | 1 row. |

## 12. Cần Cha duyệt

1. **Father policy**: xoá toàn bộ hd_change_auto/hd_input_back của father hay giữ nguyên tag `treasury_flow`?
2. **Coinjoin policy**: 3 tx multi-owner (xem `semantic_diff.csv` `ambiguous_tx=True`) đưa vào review queue hay auto-mark external?
3. **RC-12 EVM label**: có ép chain_family theo pattern tx_hash (BTC nếu match `^[0-9a-f]{64}$` không có `0x`) ở tầng scanner mới không, hay giữ nguyên và migration sẽ vá?
4. **RC-11 idempotency**: chuyển unique key sang `(tx_hash, vout_index, recipient_address)` ở G3 — có cần backfill vout_index cho row cũ không? (hiện `donations` không có cột này).
5. **hd_change_auto**: có cần re-verify lại 995 địa chỉ đã học không, hay giữ và chỉ freeze `hd_input_back`?

## 13. Non-goals của G1

- Không đề xuất migration.
- Không sửa scanner.
- Không xử lý data Father.
- Không mở G2/G3 tự động.
