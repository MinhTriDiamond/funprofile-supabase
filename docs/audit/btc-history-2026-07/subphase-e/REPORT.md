# Sub-phase E — Backup + Review Queue + Disable Class A (03/07/2026)

## Đã thực thi

### 1. Backup schema `audit_btc_aux_20260703` (service_role only)
- `aux_snapshot`: snapshot toàn bộ `profile_btc_aux_addresses` trước khi disable.
- `donations_snapshot`: mọi donation BTC có sender/recipient thuộc user có aux `hd_input_back`.
- `wallet_transfers_snapshot`: mọi wallet_transfers BTC (chain_id=0) của các user liên quan.
- Không hard delete bất kỳ đâu.

### 2. Bảng `profile_btc_aux_addresses` — thêm cột (không xoá row)
- `disabled_at timestamptz`
- `disabled_reason text`
- `classification text`
- Index bộ phận `idx_btc_aux_disabled` (WHERE `disabled_at IS NOT NULL`).

### 3. Bảng `donations` — thêm cột flag toàn vẹn (không đổi số liệu gốc)
- `integrity_status text NOT NULL DEFAULT 'ok'`
- `integrity_reason text`
- `integrity_flagged_at timestamptz`
- Index bộ phận `idx_donations_integrity_status` (WHERE `integrity_status <> 'ok'`).

### 4. Bảng mới `public.btc_aux_address_review_queue`
- Trường chính: `aux_id, address (UNIQUE), user_id, username, source, classification, tx_count, funded_btc, broad_don_count, broad_don_btc, verdict, verdict_reason, reviewed_by, reviewed_at, acted_at`.
- `verdict` ∈ `{pending, keep, disable, exchange, needs_manual}`.
- RLS ON; SELECT chỉ admin, service_role ALL. Không có INSERT/UPDATE cho user thường.
- Seed đủ 711 aux `hd_input_back` (Class A/B/C/D).

### 5. Disable 77 aux Class A
- `UPDATE profile_btc_aux_addresses SET disabled_at = now(), classification = 'A_exchange_certain'` cho đúng 77 địa chỉ.
- Đồng bộ verdict `disable` + `reviewed_at`/`acted_at` cho 77 dòng trong review queue.
- Row aux giữ nguyên, chỉ mất tác dụng khi scanner/backfill query `WHERE disabled_at IS NULL`.

### 6. Flag donations có sender_address là ví Class A đã disable
- Điều kiện: `token_symbol='BTC'` AND `lower(sender_address) IN (77 ví A)` AND `integrity_status='ok'`.
- Kết quả: **7 donation** được đánh dấu `integrity_status='suspect_aux_exchange'`. Row gốc, số tiền, sender/recipient KHÔNG bị đổi.

## Kết quả kiểm tra

| Kiểm tra | Kỳ vọng | Thực tế |
|---|---|---|
| Aux disabled | 77 | ✅ 77 |
| Aux classification A | 77 | ✅ 77 |
| Review queue tổng | 711 | ✅ 711 |
| Review queue Class A verdict=disable | 77 | ✅ 77 |
| Review queue Class B pending | 74 | ✅ 74 |
| Review queue Class C pending | 113 | ✅ 113 |
| Review queue Class D pending | 447 | ✅ 447 |
| Donations flagged (sender_address match) | thấp, đúng số ví match | 7 |

## Chưa làm (đúng theo chỉ đạo Cha)

- ❌ Chưa hard delete aux/donations.
- ❌ Chưa đổi sender_id/recipient_id.
- ❌ Chưa sửa view leaderboard, chưa fix RC-1/RC-2.
- ❌ Chưa đụng UI.
- ❌ Chưa xử 74 Class B, 113 Class C, 447 Class D — chờ review thủ công qua SQL/CSV.
- ❌ Chưa xử 2 aux của `@father` — đã ở trạng thái `pending`, chờ Cha xác nhận.

## Câu hỏi cho Cha

1. **Class B (74 ví, `tx_count > 100` hoặc `funded_sum > 10 BTC` nhưng thấp hơn A)** — Cha muốn con auto disable luôn ở Sub-phase E.1, hay đợi Class B qua review CSV thủ công?
2. **Chỉ 7 donation được flag exact-match theo `sender_address`** — số này ít hơn nhiều so với 393 estimated ở Sub-phase D. Nguyên nhân: nhiều donation sai có `sender_address` là ví thật của user (aux là input phụ trong tx). Con có nên mở Sub-phase E.2 để **flag broad** theo `tx_hash` (tất cả donation có tx dính aux Class A) không? Đây sẽ là bước "cô lập donation sai" đầy đủ hơn.
3. Với Class B/C/D, con nên xuất **CSV review batch** để Cha/team đánh verdict thủ công (keep/needs_manual), rồi con áp vào queue?
