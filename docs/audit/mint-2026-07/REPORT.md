# Báo cáo đối soát Mint FUN Money — 30/07/2026

## 1. Số liệu 2 tháng gần nhất (trước xử lý)

| Tháng | confirmed | failed | signed | split_parent | queued_split |
|---|---|---|---|---|---|
| 07/2026 | 79 / 18,061,597 FUN | 34 / 16,272,075 | 6 / 1,714,155 | 9 / 9,412,071 | 1 / 76,007 |
| 06/2026 | 286 / 30,945,389 | 214 / 35,663,992 | 0 | 8 / 8,293,711 | 1 / 100,000 |

Phân loại failed:
- EPOCH_CAP revert: 164 lệnh T6 (14,613,545 FUN) + 34 lệnh T7 (16,272,075 FUN)
- Stale nonce - replaced by remint: 50 lệnh T6 (21,050,447 FUN) — lệnh cũ bị thay thế, không mất tiền

## 2. Allocation chưa claim (toàn hệ thống, thời điểm rà soát)

| Epoch | Pending | FUN |
|---|---|---|
| 06/2026 | 258 | 12,022,955 |
| 05/2026 | 209 | 6,886,100 |
| 04/2026 | 365 | 11,014,711 |
| 03/2026 | 173 | 329,697 |

391 user (trong 75 ngày gần nhất) chưa claim, trong đó 104 user chưa liên kết ví.

## 3. Trường hợp kẹt & cách xử lý

| Loại | Chi tiết | Xử lý |
|---|---|---|
| split_parent toàn bộ child failed | 6 allocation / ~6.28M FUN (maithicay1485688, angelutopia x2, nguyenthu688, angel_vinhnguyen, caodinhlam) | RPC auto-flip mở rộng → reset về `pending` + notify |
| split partial | angelbaoan, alloc `f00b468c…` | reset `pending`, trừ 73,831 FUN đã mint |
| queued_split 0 child | angelutopia 100,000 FUN (16/06); maithicay1485688 76,007 FUN (08/07) | đánh `failed` (guard 24h mới) |
| submitted treo | binhtran568 39,313 FUN (01/05), không tx_hash | đánh `failed` → mở lại allocation |
| backlog signed | 6 lệnh / 1,714,155 FUN, toàn GRATITUDE | edge `pplp-rebalance-throttled-action` + cron 05:30 UTC |

## 4. Sau xử lý (kiểm tra lại)
- `claimed` + mint request `failed/rejected/split_parent hỏng`: **0**
- Còn lại: 25 allocation `claimed` gắn `split_parent` có child confirmed (bình thường) và 6 allocation gắn lệnh `signed` đang xếp hàng.
- Đã gửi 746 thông báo nhắc claim (358 user có ví / 388 user chưa có ví).

## 5. Thay đổi kỹ thuật
- Migration: `auto_flip_recoverable_mint_allocations()` xử lý thêm `split_parent` hỏng + guard `queued_split` > 24h.
- Edge function mới: `supabase/functions/pplp-rebalance-throttled-action/index.ts`.
- Cron mới: `pplp-rebalance-throttled-action-daily` (`30 5 * * *`).
- UI: `src/components/admin/UnclaimedByEpochCard.tsx` trong tab Mint của /admin.
