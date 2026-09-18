# PHẦN D — Bước 9: Snapshot nguyên trạng 2 dòng TRƯỚC khi sửa

Chụp lúc **2026-08-25 10:29 UTC**, nguồn: `SELECT … FROM profiles WHERE id IN (…)`.
Đây là bằng chứng trước-khi-sửa; KHÔNG được xoá file này.

## Dòng 1 — phongyknb984t341b

| Cột | Giá trị |
|---|---|
| id | `7adc5b10-8733-402d-ba7e-c14887c2382b` |
| username | `phongyknb984t341b` |
| **btc_address** | `178qtdaz22y8mzdhgmqq6nso1467dgasvy` (P2PKH, all-lower, Base58 KHÔNG hợp lệ) |
| btc_addresses | `[]` |
| wallet_address | NULL |
| public_wallet_address | NULL |
| external_wallet_address | NULL |
| created_at | 2026-06-16 17:43:33.529236+00 |
| updated_at | 2026-06-17 01:04:27.395755+00 |

## Dòng 2 — angelthaihoa

| Cột | Giá trị |
|---|---|
| id | `d170050a-46d8-4790-9721-0e976d879338` |
| username | `angelthaihoa` |
| **btc_address** | `3jrhcdbargfib8mjmapsm3cgxur3ev4zb1` (P2SH, all-lower, Base58 KHÔNG hợp lệ) |
| btc_addresses | `[]` |
| wallet_address | `0xcaacaf6ca8fa9fe01ff6908912993fe294317d86` |
| public_wallet_address | `0xcaacaf6ca8fa9fe01ff6908912993fe294317d86` |
| external_wallet_address | `0xcaacaf6ca8fa9fe01ff6908912993fe294317d86` |
| created_at | 2026-06-24 19:06:16.464719+00 |
| updated_at | 2026-06-25 04:20:33.193481+00 |

Đối chiếu bổ sung (đã query trước đó): **0 dòng** trong `donations`,
`transactions`, `wallet_transfers`, `profile_btc_aux_addresses` liên quan 2 địa chỉ này
⇒ xoá về NULL không ảnh hưởng lịch sử giao dịch.

---

# Bước 10 — PREVIEW (dry-run, CHƯA chạy UPDATE)

Điều kiện WHERE khớp **chính xác theo user_id**, không dùng pattern chung:

```sql
-- DRY-RUN đã chạy: trả về ĐÚNG 2 dòng ở trên
SELECT id, username, btc_address
FROM public.profiles
WHERE id IN (
  '7adc5b10-8733-402d-ba7e-c14887c2382b',  -- phongyknb984t341b
  'd170050a-46d8-4790-9721-0e976d879338'   -- angelthaihoa
)
AND btc_address IS NOT NULL;
```

Câu UPDATE sẽ chạy **sau khi CTO Confirm**:

```sql
UPDATE public.profiles
SET btc_address = NULL, updated_at = now()
WHERE id IN (
  '7adc5b10-8733-402d-ba7e-c14887c2382b',
  'd170050a-46d8-4790-9721-0e976d879338'
)
AND btc_address IN (
  '178qtdaz22y8mzdhgmqq6nso1467dgasvy',
  '3jrhcdbargfib8mjmapsm3cgxur3ev4zb1'
);   -- kỳ vọng: 2 rows affected
```

Ghi chú kỹ thuật: trigger `trg_btc_address_lock` (kill-switch đang BẬT khoá) **miễn
trừ service_role** ⇒ câu UPDATE chạy qua đường hệ thống sẽ không bị chặn; trigger
`trg_wallet_writer_guard` sẽ tự ghi 2 dòng audit vào `wallet_writer_audit`.

Bước 11 (notification `FUN.RICH`, pattern `epoch_reset_info`) và bước 12 (báo cáo
sau khi sửa) chỉ thực hiện **sau** khi UPDATE được Confirm.
