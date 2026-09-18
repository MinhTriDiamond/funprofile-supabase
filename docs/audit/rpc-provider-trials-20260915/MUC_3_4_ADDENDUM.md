# Phụ lục — MỤC 3 (giá Moralis Pro) và MỤC 4 (đo lại tỉ lệ block null)

## MỤC 3 — Số "$199 Moralis Pro" là SAI, số đúng là **$249/tháng**

- Bảng giá Moralis 2026 gồm 4 gói: Free → Starter → **Pro** → Business/Enterprise, khoảng
  **$49–$249/tháng**; Pro là mốc **$249** ([4](https://propicked.com/business/moralis/pricing)).
- Trang giá gốc Moralis vẫn xác nhận cấu trúc gói và Free = 40.000 CU/ngày, 40 RPS
  ([1](https://moralis.com/pricing/)).
- Nguồn lệch: con số $199 bé nêu trước đó lấy theo mức Pro cũ (trước lần điều chỉnh giá), không
  phải theo ảnh chụp bảng giá hiện tại. **Ghi nhận sai, sửa về $249.**
- Chi phí tính lại cho phương án đối chiếu chéo:
  - Moralis Pro $249 + Etherscan Lite $49 = **$298/tháng** (không phải ~$248).
  - Phương án đang khuyến nghị: 1 key RPC trả phí ~$49/tháng (QuickNode Build hoặc Alchemy
    tương đương) + endpoint công khai dự phòng = **~$49/tháng**.
  - Với phát hiện ở MỤC 2 (`alchemy_getAssetTransfers` không giới hạn span), gói Alchemy trả phí
    còn thay được cả vai trò indexer của Moralis.

## MỤC 4 — Tỉ lệ block null đo lại với rotation 10 endpoint + gap-tracking hiện tại

Cửa sổ đo: 24 giờ tính tới 15/09/2026 01:20 UTC.

| Chỉ số | Giá trị |
|---|---|
| Số tick | 726 (đúng nhịp cron 2 phút) |
| Tick lỗi (`ok = false`) | **0** |
| Dòng gap tạo mới trong 24h | 168 (trong đó `null_from_node` = **93**) |
| `gap_blocks_added` (tổng theo tick) | 638 |
| `gaps_resolved` | 93 |
| **Gap chưa resolve tại thời điểm đo** | **0** |
| Block chuỗi BSC trong 24h (0,75 s/block) | ≈ 115.200 |

**Tỉ lệ null ≈ 93 / 115.200 ≈ 0,08 %** (so với **18 %** ghi nhận ngày 18/08/2026).

Kết luận: con số 18% không còn đúng. Hai thay đổi đã vá gốc vấn đề:
1. **Rotation 10 endpoint** (Alchemy + QuickNode + 8 công khai) — không còn dựa vào một node yếu.
2. **Gap-tracking**: block đọc không được vào `scanner_block_gaps`, watermark **không** nhảy qua,
   tick sau retry tới khi đọc thành công. 93/93 block null trong 24h đều đã resolve.

Nói cách khác: null vẫn xảy ra (bản chất node công khai), nhưng **không còn gây sót giao dịch**
vì không block nào bị bỏ lại phía sau.

## MỤC 1 — Đã vá cảnh báo (ghi kèm ở đây cho đủ hồ sơ)

- Thêm `supabase/functions/scanner-health-watchdog/index.ts` + cron `scanner-health-watchdog-15min`
  (15 phút/lần, 96 lần/ngày).
- Ngưỡng cảnh báo: không có tick `ok=true` trong **60 phút**; watermark không nhích > 60 phút;
  watermark tụt > 3.000 block; Moralis chỉ có lỗi và 0 call thành công; gap chưa resolve > 500.
- Cảnh báo ghi `notifications` cho mọi admin, `type = wallet_reconciliation_alert`,
  `metadata.source = scanner_health_watchdog`, dedupe 3 giờ, actor = system actor FUN.RICH
  (`a97cbb6c-2d00-40e9-a35a-f181273b17bb`) — không gán cho người thật.
- Chạy thử 15/09 01:18 UTC: `healthy: true`, 0 gap chưa resolve, tick mới nhất 0 phút, native lag
  2.579 block (dưới ngưỡng 3.000).
