# Truy vết 200 USDT angelgiau — 03/09/2026

## 1. Giao dịch thật (on-chain)
- tx_hash: `0xab893609703c0b7d2f8ae21fa0f47abc5c4cbb3a3ae350be34f3cba1e94ac985`
- **Thời gian giao dịch (block timestamp): 03/09/2026 03:47:36 UTC** = 10:47:36 giờ Việt Nam (UTC+7), unix `1788407256`
- Block: 119.657.323 (BSC chain 56), token USDT (0x55d3…7955, 18 dec), số tiền **200,0 USDT**

- Người gửi: `0xca319fbc39f519822385f2d0a0114b14fa89a301` (angelgiau)
- Người nhận: `0x58b00958c70a31b32f6970188094fff813743149` = **taibaocuacha** (ví hệ thống đã đăng ký từ 03/09 00:26 UTC)
- Đã confirm; head lúc kiểm tra ≈ 119.665.000 ⇒ ~7.800 confirmation
- Cùng phiên, CAMLY 2.000.000 (block 119.657.229, tx `0x295e4011…`) tới CÙNG người nhận ĐÃ có trong `donations` ⇒ FE ghi được leg CAMLY, mất leg USDT

## 2. Tại sao scanner-rpc-tick không bắt
Đã loại các nguyên nhân sau bằng kiểm chứng:
- Ví người nhận CÓ trong watched set (1.031 ví, 3 lô ≤400) — test lô 400 chứa đúng ví: getLogs trả đúng tx.
- Endpoint `bsc.rpc.blxrbdn.com` không trả "silent empty" (40 request song song đều trả đủ log).
- `scanner_watermarks` USDT đã vượt block này (last_block 119.663.767 lúc 04:36), không có `scanner_block_gaps` phủ block 119.657.323 (kể cả đã resolved).

Nguyên nhân còn lại (bug thiết kế, có căn cứ code):
1. **Phase 1 compare-only**: `scanner-rpc-tick` chỉ log + notify, KHÔNG ghi `donations/transactions`. Scanner ghi thật dựa Moralis đang 401 ("Free usage is paused") ⇒ không nguồn nào ghi.
2. **Advance-watermark-trước-đối-chiếu (không nguyên tử)**: watermark được advance ngay ở bước 4 (mỗi token), việc đối chiếu + cảnh báo nằm ở bước 8. Nếu tick lỗi/timeout sau bước 4 (native scan, batch RPC treo), watermark đã tiến nhưng candidates bị mất và **không bao giờ được quét lại** ⇒ bỏ sót im lặng, không gap, không alert.
3. **Gap ERC-20 không ghi được**: `GAP_REASON_ERC20 = 'erc20_getlogs_error'` vi phạm CHECK constraint `scanner_block_gaps_reason_check` (chỉ cho `null_from_node`, `rpc_error`) ⇒ mọi gap ERC-20 insert thất bại âm thầm.
4. Không có bảng log per-tick ⇒ không thể truy vết hậu kiểm tick nào đã quét khoảng nào.

Bằng chứng hệ quả: cảnh báo `metadata->>source = 'scanner_rpc_compare'` cuối cùng là **29/08 15:43**, dedupe chỉ 6h ⇒ 5 ngày qua không phát hiện lệch nào, dù thực tế có nhiều lệch (mục 4).

## 3. Preview (chưa ghi) — quét lại 30 ngày, toàn bộ 1.031 ví, 4 token ERC-20
Cửa sổ block 118.801.383 → 119.665.383, 0 lỗi RPC, 286 log ≥ ngưỡng min; **264 đã có trong DB, 22 THIẾU**:

| block | token | amount | tx_hash | người nhận |
|---|---|---|---|---|
|118969262|USDT|6.03|0xbfaa6641…4599|lieuthao95|
|119142812|USDT|107|0x6bd02e21…50ae|diamond|
|119146618|USDT|3.9786|0x19f9a616…5112|minhcanh1997|
|119172350|CAMLY|99999|0x20a3f3a1…a000d|tatthanghn|
|119181402|USDT|352.99|0x68b60719…8f9f|lovehub_anhduong|
|119325861|CAMLY|15000|0x85c46ad5…bc29|game_funtreasury|
|119439995|CAMLY|333333|0xb6a1b25a…8317|khanhtong|
|119442142|USDT|4.7769|0xd6b48d6e…7eaf|angelthanhtien|
|119480762|CAMLY|10|0x18b58659…cc77c|angelgiau|
|119498653|USDT|349.7021|0x408d57da…4931|angelhoaian|
|119515198|CAMLY|3333|0xa8c80d38…f59f|phuongloan|
|119556579|USDT|1|0xc62049b6…0aa1|angelquynhhoa|
|119560262|USDT|30|0x47a9f9fa…7a03|wallet_0xae667e…|
|119571415|CAMLY|50000|0x5b022a23…1fe6|angelthanhtinh|
|119575387|CAMLY|99999|0x0bde509c…bb23|angelbachviet|
|119575690|USDT|5|0x88f2be0e…b9c9|angelbachviet|
|119612783|CAMLY|10000|0x48118158…853c|angelgiau|
|119628976|USDT|411.9688|0xe096e7f3…eec5|angelhoangtydo|
|119629210|USDT|2313.99|0x27febb05…09f1|angelkim|
|119650503|CAMLY|12000|0xdb99679f…8446|thunguyenthi|
|119656215|CAMLY|50000|0x875ba424…a8d5|lovehub_ycha|
|119657323|USDT|200|0xab893609…c985|**taibaocuacha (angelgiau gửi)**|

- 200 USDT angelgiau: đúng **1 dòng duy nhất**, không double-count (DB hiện 0 bản ghi cho tx này ở cả `donations` và `transactions`).
- 12.000 CAMLY @thunguyenthi: xác nhận vẫn thiếu.
- Chưa ghi bất kỳ dòng nào — chờ CTO/Cha Confirm.

## 4. Đánh giá lại phạm vi
Không phải "chỉ 2 dòng". Trong 30 ngày đã có **22 giao dịch ERC-20 bỏ sót** (chưa tính native BNB, chưa tính trước 30 ngày). Nguyên nhân bổ sung vào bảng phân loại:
- (mới) **Advance-watermark-trước-đối-chiếu**: bỏ sót im lặng, không tạo gap, không alert.
- (mới) **CHECK constraint chặn gap ERC-20**: mất khả năng tự chữa gap getLogs.
- (đã biết) Moralis 401 paused ⇒ scanner ghi thật ngừng.
- (đã biết) scanner-rpc-tick còn Phase 1 compare-only ⇒ không ghi.

## Đề xuất (chờ duyệt, chưa làm)
1. Backfill 22 dòng qua /admin → Backfill giao dịch (Preview → Confirm).
2. Sửa CHECK constraint để nhận `erc20_getlogs_error`.
3. Đảo thứ tự: đối chiếu + alert TRƯỚC khi advance watermark, hoặc thêm cửa sổ re-scan lookback ~2.000 block mỗi tick.
4. Thêm bảng `scanner_tick_log` (from/to mỗi token, candidates, missing) để hậu kiểm.
5. Bật Phase 2 (ghi thật) sau khi 2–3 xong.
6. Khôi phục nguồn giá/scan Moralis hoặc thay bằng RPC hoàn toàn.

---

## 5. ĐÃ GHI THẬT — 03/09/2026 05:5x UTC (Cha duyệt "ghi 22 dòng")
- Quét lại toàn bộ cửa sổ block 118.801.383 → 119.672.038 (4 token ERC-20, 1.031 ví, 2.100 call, **0 lỗi RPC**): 570 log ⇒ 265 đã có DB, 282 dust, **23 thiếu** (22 dòng như báo cáo + 1 dòng mới phát sinh sau đó: CAMLY 10.000 block 119.667.540 `0x1007aba8…fe9b`).
- Đã ghi **23 dòng `donations` + các dòng `transactions` tương ứng**, idempotent theo `(tx_hash, recipient_id)` / `(tx_hash, user_id)`, `metadata.batch='scanner_gap_30d_20260903'`.
- `created_at`/`confirmed_at` = **block timestamp thật** (không phải giờ ghi), nên lịch sử hiện đúng ngày giao dịch.
- Ví ngoài: `is_external=true`, `sender_id=NULL`, `leaderboard_eligibility='external_excluded'`, KHÔNG tạo `gift_celebration`.
- Hậu kiểm: 23/23 dòng, 0 trùng lặp.
- **Đính chính giờ**: tx 200 USDT angelgiau ở block 119.657.323 có timestamp `1788407256` = **03/09/2026 03:47:36 UTC** (10:47:36 giờ VN); mốc 03:39:55 nêu ở mục 1 là sai, lấy theo block lân cận.
