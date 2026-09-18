# M6B-3 · Fast-Scan Upgrade Plan (Phương án A)

Ngày: 2026-07-01 · Chưa apply, chờ review.

Cha đã chọn **PHƯƠNG ÁN A**: giữ `fast-scan-donations` làm scanner chính, deprecate `auto-scan-donations` sau khi nâng cấp.

---

## Gap của fast-scan hiện tại

Đối chiếu với `auto-scan-donations`:

| Chức năng | auto-scan | fast-scan | Cần thêm |
|---|:---:|:---:|:---:|
| BEP20 Transfer (USDT/CAMLY/FUN) | ✅ | ✅ | — |
| Native BNB transfer | ✅ (từ 30/06/2026) | ❌ | ⚠️ |
| BTC native | ✅ | ❌ | ⚠️ |
| INSERT `donations` khi có sender_id | ✅ | ✅ | — |
| INSERT `wallet_transfers` khi ví ngoài | ❌ | ❌ | ⚠️ (mới) |
| Idempotent atomic (ON CONFLICT DO NOTHING) | Partial | Partial | ⚠️ chuẩn hóa |
| Post/notification guard (không tạo cho ví ngoài) | ✅ | ✅ | — |
| Anti-duplicate post | Có (external_wallet_no_gift) | Có | — |

## Roadmap (4 bước, không xóa auto-scan ngay)

### Bước 1 · Nâng fast-scan (không đụng cron)

1. Thêm handler native BNB (dùng Moralis `/wallet/:address/history?chain=bsc`, filter `value > 0 AND to_address = user`).
2. Thêm nhánh `wallet_transfers` cho các Transfer mà `sender_id IS NULL` (ví ngoài) — cùng cấu trúc với auto-scan.
3. Chuẩn hóa mọi INSERT bằng `.upsert({...}, { onConflict: 'tx_hash', ignoreDuplicates: true })` để không phá idempotency.
4. Side-effect guard: chỉ tạo `posts`/`notifications`/`conversations` khi `sender_id IS NOT NULL AND recipient_id IS NOT NULL AND is_external = false`.

### Bước 2 · Chạy song song 48h

- Bật cả 2 cron (auto-scan mỗi 5', fast-scan mỗi 5').
- Query so sánh:
  ```sql
  -- Số dòng insert bởi mỗi scanner theo giờ (dựa vào created_at + verified_by/metadata source)
  SELECT date_trunc('hour', created_at) hour,
         count(*) FILTER (WHERE metadata->>'scanner'='fast')  fast_ins,
         count(*) FILTER (WHERE metadata->>'scanner'='auto')  auto_ins
    FROM donations
   WHERE created_at > now() - interval '48h'
   GROUP BY 1 ORDER BY 1;
  ```
- Kỳ vọng: `fast_ins ≈ auto_ins` cho mỗi giờ; delta < 2%.

### Bước 3 · Disable auto-scan cron

- `select cron.unschedule('auto-scan-donations-*')` (giữ code, chỉ tắt trigger).
- Ghi log admin.

### Bước 4 · Monitor 7 ngày rồi xóa code

- Nếu `wallet-reconciliation-cron` (safety net 30') không tìm thêm dòng nào bị fast-scan bỏ sót ⇒ xóa `supabase/functions/auto-scan-donations/`.

## Rollback

Mỗi bước reversible độc lập:
- Bước 1: revert code fast-scan.
- Bước 2: chỉ observation, không xóa.
- Bước 3: `cron.schedule` lại auto-scan.
- Bước 4: git revert.

## Chờ Cha duyệt Bước 1 để bé triển khai code.
