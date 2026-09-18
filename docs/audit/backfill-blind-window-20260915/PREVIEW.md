# MỤC 0 — Kế hoạch backfill vùng mù 31/08 → 15/09 (PREVIEW, chưa ghi gì)

Trạng thái: **chỉ là kế hoạch + số đo thật. Chưa ghi 1 dòng nào vào `donations`/`transactions`/`wallet_transfers`.**

## 1. Phạm vi vùng mù (đo thật lúc 01:14 UTC 15/09)

| Mốc | Block | Thời điểm UTC |
|---|---|---|
| Đầu vùng mù | 119.147.673 | 2026-08-31 12:00:00 |
| Head hiện tại | 121.939.851 | 2026-09-15 01:14:36 |
| **Cần quét lại** | **2.792.178 block** | **≈ 14,5 ngày chuỗi** |

Watermark hiện tại đã nằm sát head (ERC20 = 121.939.500; native = 121.937.731), tức vùng
119.147.673 → ~121,9M **chưa từng được quét** bởi đường RPC.

## 2. Làm rõ đơn vị (điểm Cha yêu cầu ghi rõ)

- **THỜI GIAN BỊ MÙ = 14,5 ngày chuỗi = 2,79 triệu block.** Đây là dữ liệu cần quét lại.
- **"~2h" và "~20–30h" là THỜI GIAN CHẠY SCRIPT**, không phải khoảng bị mù. Số đo lại hôm nay:

| Luồng | Cách quét | Số request | Thời gian CHẠY dự kiến |
|---|---|---|---|
| ERC20 (USDT/CAMLY/FUN/BTCB) | `eth_getLogs` span 5.000 block, 3 lô ví/call | 559 × 4 token × 3 lô ≈ **6.700** | **1,5 – 3 giờ** |
| Native BNB | đọc full block, batch 50 block/request, 3 luồng | 2.792.178 / 50 ≈ **55.800** | **8 – 30 giờ** (tuỳ độ ổn định endpoint) |

Lưu ý quan trọng: **không thể backfill bằng cách lùi watermark của cron hiện tại.** Cron 2 phút
hiện chỉ đạt ~190.000 block/ngày cho native — đúng bằng nhịp chuỗi sinh block. Lùi watermark sẽ
làm scanner tụt lại và **mù tiếp phần mới**. Backfill phải chạy bằng worker riêng, watermark riêng.

## 3. Kế hoạch 3 bước (Preview → Confirm → Execute)

**Bước A — Preview (không ghi tài chính):**
- Edge function mới `scanner-backfill-window`, tham số `from_block`, `to_block`, `mode=preview`.
- Dùng lại `logsEndpoints()` + `ingestTransfer` ở chế độ **so sánh**: phân loại candidate, đối chiếu
  `donations`/`transactions` theo `(tx_hash, user_id)`, **chỉ ghi vào bảng mới
  `scanner_backfill_candidates`** (bảng preview, không phải bảng tài chính).
- Kết quả Preview trình Cha: số giao dịch thiếu, chia theo token/ví/ngày, danh sách mẫu.

**Bước B — Confirm:** Cha xem bảng Preview và ra lệnh ghi.

**Bước C — Execute:** cùng function, `mode=execute`, đọc **đúng** các dòng đã Preview, ghi qua
`ingestTransfer` (idempotent `(tx_hash, user_id)`, địa chỉ lowercase, amount BigInt string, ví
ngoài `is_external=true`, không tạo `gift_celebration`), audit theo lý do
`scanner_blind_window_backfill_20260915`.

Watermark của cron live **không bị chạm** ở cả 3 bước.

## 4. Việc cần Cha quyết trước khi bé code Bước A

1. Chốt mốc đầu vùng mù: **31/08 12:00 UTC (block 119.147.673)** — hay lùi thêm cho an toàn?
2. Backfill cả native BNB ngay, hay làm ERC20 trước (nhanh, giá trị lớn) rồi native sau?

---

## CẬP NHẬT 15/09/2026 01:20 UTC — ĐỔI ĐƯỜNG QUÉT (rẻ và nhanh hơn nhiều)

Sau khi đo `alchemy_getAssetTransfers` (xem `docs/audit/rpc-provider-trials-20260915/ALCHEMY_ASSET_TRANSFERS.md`):
span 2,8 triệu block trả 200 trong 372 ms trên gói **free**, 5 call liên tiếp không dính rate limit,
category `external` bao được cả native BNB.

Vì vậy Bước A đổi từ `eth_getLogs` + đọc full block sang **1 call/ví trên toàn vùng mù**:

| | Kế hoạch cũ | Kế hoạch mới |
|---|---|---|
| Số request | ~62.500 | ~1.100–1.500 |
| Thời gian CHẠY SCRIPT | 10–33 giờ | **~10–20 phút** |
| Native BNB | phải đọc full block | gộp cùng, category `external` |

Bất biến giữ nguyên: Preview ghi vào `scanner_backfill_candidates` (không phải bảng tài chính),
chờ Cha CONFIRM mới Execute qua `ingestTransfer` (idempotent `(tx_hash, user_id)`, địa chỉ lowercase,
amount BigInt string, ví ngoài `is_external = true`, không tạo `gift_celebration`),
audit lý do `scanner_blind_window_backfill_20260915`, watermark cron live không bị chạm.

⚠️ Bắt buộc: đọc `rawContract.value` (hex) → BigInt string. KHÔNG dùng trường `value` (float) của Alchemy.

**Vẫn chờ Cha chốt 2 điều để bé code Bước A:**
1. Mốc đầu vùng mù: block 119.147.673 (31/08 12:00 UTC), hay lùi thêm cho an toàn?
2. Quét ERC20 + native cùng lúc (giờ đã đủ nhanh để làm chung) — bé đề xuất làm chung.
