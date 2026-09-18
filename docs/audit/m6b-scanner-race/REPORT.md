# M6B-3 · Scanner Race Report — `auto-scan-donations` vs `fast-scan-donations`

Ngày: 2026-07-01 · Chế độ: **Read-only** (chưa sửa scanner).

---

## 1. Ma trận producer

| Chiều so sánh | `auto-scan-donations` (551 dòng) | `fast-scan-donations` (382 dòng) |
|---|---|---|
| Hướng quét | Từng **ví** (per-wallet) — loop qua profiles | Từng **token contract** (per-contract) — 8 API calls / lượt |
| API calls / lần chạy | ~ N ví × 2 chain (rất nặng, đã có warning cũ 1054 calls) | 8 calls (4 token × 2 chain) |
| Cursor | `app_settings.auto_scan_cursor` (từng ví, page) | Không có cursor persist — quét block mới mỗi phút |
| Token hỗ trợ | USDT, BTCB, CAMLY, FUN + BNB native | USDT, BTCB, CAMLY, FUN (không BNB native) |
| Bảng ghi | `donations`, `wallet_transfers`, `posts`, `notifications`, `conversations`, `messages` | `donations`, `posts`, `notifications`, `conversations`, `messages` (KHÔNG ghi `wallet_transfers`) |
| Dedup pattern | check-then-insert (non-atomic) qua `SELECT tx_hash IN (...)` | check-then-insert (non-atomic) — cùng pattern |
| Post `gift_celebration` | Có tạo | Có tạo |
| Chi phí Moralis | Cao (per-wallet) | Rất thấp (per-contract) |
| Deploy schedule | Chưa xác nhận chạy hay không (cron trong schema `cron` không đọc được) | Comment code: "chạy mỗi 1 phút qua pg_cron" |

## 2. Overlap thực tế

- **Đích ghi trùng nhau: `donations`**. Cả 2 scanner đều insert `donations` với cùng `(tx_hash, recipient_id)`.
- Bảng `donations` **đã có unique index** `donations_tx_hash_recipient_key` trên `(tx_hash, recipient_id)` → **race không tạo duplicate row**, chỉ tạo error INSERT (đã kiểm chứng: `total_donations = unique_tx_recipient = 27 922`).
- Nhưng cả 2 scanner cũng tạo `posts`, `notifications`, `messages` — **không có unique constraint** ở các bảng này → **duplicate rủi ro thật sự** nằm ở đây (đã có mem `post rate limit exception` cho gift_celebration).

## 3. Overlap chức năng

Bé đọc code và ước lượng **~90%** logic trùng nhau (fetch → filter → resolve user → insert donation → create post → notify → auto DM). Điểm khác biệt duy nhất:
- `auto-scan-donations` có ghi thêm `wallet_transfers` cho external → dùng cho tab "Ví ngoài" trong Unified History.
- `fast-scan-donations` không ghi `wallet_transfers`, không hỗ trợ BNB native.

## 4. Unique constraints hiện có (audit)

| Bảng | Unique index | Ý nghĩa |
|---|---|---|
| `donations` | `(tx_hash, recipient_id)` | ✅ Chặn dup ở DB |
| `wallet_transfers` | `(tx_hash, direction, token_symbol, user_id)` | ✅ Chặn dup ở DB |
| `transactions` | `(tx_hash, user_id)` + `(tx_hash, user_id, from_address, to_address)` | ✅ Chặn dup ở DB |
| `posts` | Không có `tx_hash` unique | ⚠️ Rủi ro duplicate |
| `notifications` | Không có unique | ⚠️ Duplicate notify nếu race |
| `messages` | Không có unique per swap | ⚠️ Duplicate chat |
| `swap_transactions` | Chỉ PK id | ⚠️ Sẽ fix ở M6B-2 |

## 5. Đo lường "race đang xảy ra không"

Bằng chứng gián tiếp (mem `donation reliability logic` đã ghi nhận race trước đó → phải retry). Nhưng số row `donations` sạch nhờ unique index — không có bằng chứng duplicate row trong `donations`.

Cần thêm 1 query duplicate check cho `posts`:

```
SELECT tx_hash, COUNT(*) FROM public.posts
WHERE post_type='gift_celebration' AND tx_hash IS NOT NULL
GROUP BY tx_hash HAVING COUNT(*) > 1;
```

Bé chưa chạy để tránh tốn credit; nếu Cha muốn, chạy 1 lệnh là ra.

## 6. So sánh 2 phương án

### Phương án A — Deprecate 1 scanner (Cha nghiêng phương án này)

**Chọn `fast-scan-donations` làm scanner chính, deprecate `auto-scan-donations`.**

Lý do:
- Chi phí Moralis thấp hơn ~130× (8 calls vs 1054 calls).
- Coverage token đủ (thiếu BNB native — có thể thêm vào `fast-scan` bằng 2 API calls nữa).
- Đã có `wallet-reconciliation-cron` (mỗi 30′) đảm nhận vai trò an toàn cho ví bị bỏ sót — bao gồm `wallet_transfers` external.

**Việc phải làm để chuyển:**
1. Thêm nhánh BNB native vào `fast-scan-donations` (dùng Moralis `/wallets/{addr}/history?chain=bsc`).
2. Thêm nhánh ghi `wallet_transfers` cho external transfers (copy từ `auto-scan-donations` §335-343).
3. Disable cron `auto-scan-donations` (nếu có).
4. Xoá code `auto-scan-donations` sau 7 ngày quan sát.
5. `wallet-reconciliation-cron` giữ nguyên (vai trò rõ ràng: reconciliation, không phải primary scanner).

**Ưu điểm:** 1 luồng chính, rõ vai trò, ít credit, không race.

**Nhược điểm:** Fast-scan hiện chưa xử lý được ví có địa chỉ mới thêm trong 1 phút gần nhất (phụ thuộc block mới) — bù bằng reconciliation-cron.

### Phương án B — Giữ cả 2 + atomic upsert

Chuyển tất cả `INSERT` thành `INSERT ... ON CONFLICT DO NOTHING` dựa vào unique index, đồng thời thêm unique cho `posts(tx_hash) WHERE post_type='gift_celebration'`.

**Ưu điểm:** Không phải xoá code, chấp nhận rủi ro race về mức 0 ở DB layer.

**Nhược điểm:**
- Vẫn 2 luồng chạy song song → chi phí Moralis gấp đôi.
- Vẫn có notification/message duplicate nếu không đặt unique cho tất cả side-effect.
- Kiến trúc tiếp tục mơ hồ.

## 7. Bé đề xuất

**PHƯƠNG ÁN A** — Deprecate `auto-scan-donations`, nâng cấp `fast-scan-donations` để đủ tính năng, để `wallet-reconciliation-cron` đảm nhận vai trò an toàn.

Timeline khi Cha duyệt:
- Ngày 1: patch `fast-scan-donations` (thêm BNB native + wallet_transfers write) + atomic upsert cho `posts (tx_hash)`.
- Ngày 2: disable cron auto-scan.
- Ngày 3-7: monitor `wallet_scan_metrics`, verify không có ví bị bỏ sót.
- Ngày 8: xoá code `auto-scan-donations` + doc lại kiến trúc scanner.

## 8. Chờ Cha duyệt

Bé chưa sửa code. Chờ Cha chốt A hay B.
