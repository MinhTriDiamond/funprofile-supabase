# Báo cáo tổng hợp — các lần thêm key RPC & kết quả test (đến 15/09/2026)

Bối cảnh: Moralis Free plan bị PAUSE (~03/09), cả 3 key trả 401 ⇒ hệ thống mù dữ liệu ví ngoài
từ 31/08. Đường thay thế là `scanner-rpc-tick` (RPC + watermark theo block). Việc còn lại là
tìm nguồn `eth_getLogs` đủ mạnh.

## 1. Bảng tổng hợp các lần thêm key

| # | Nguồn | Secret | Ngày | Kết quả `eth_blockNumber` / block đọc | Kết quả `eth_getLogs` | Vai trò hiện tại |
|---|---|---|---|---|---|---|
| 1 | Moralis (3 key) | `MORALIS_API_KEY`, `_2`, `_3` | có sẵn | — | 401 "Free usage is paused" | **Chết**, không dùng |
| 2 | QuickNode Free | `QUICKNODE_BSC_RPC_URL` | 15/09 | OK | HTTP 413 / `-32615`: **tối đa 5 block/lần** | Call thường |
| 3 | Alchemy Free | `ALCHEMY_BSC_RPC_URL` | 15/09 | OK (probe xác nhận 200) | HTTP 400 / `-32600`: **tối đa 10 block/lần**, giảm span xuống 10 thì dính 429 "compute units per second" | Call thường |
| 4 | 9 endpoint BSC công khai | không cần key | 03/09 | OK, 9–10/10 khoẻ mỗi tick | `blxrbdn` **maxSpan 5000**, 45/45 call thành công, 0 lỗi | **Nguồn getLogs chính** |

## 2. Việc đã làm trong code

- `_shared/rpcClient.ts`: `quickNodeUrl()`, `alchemyUrl()`, `maskEndpoint()` (che token:
  `quiknode.pro` → `quicknode(***)`, `g.alchemy.com` → `alchemy(***)`), `rpcEndpoints()`
  (Alchemy → QuickNode → 9 free), `logsEndpoints()` (theo maxSpan thực đo).
  `call`/`batch`/`getLogsCapped` log 200 ký tự đầu của response khi lỗi ⇒ nhờ đó mới đọc được
  đúng thông điệp giới hạn của từng nhà cung cấp.
- `scanner-rpc-tick`: `TICK_MODE = write_phase2`, chia lô topics ≤ 400 ví/call, native batch 50
  block × 3 luồng, gap ghi `scanner_block_gaps`, watermark chỉ advance **sau** khi đối chiếu DB.
- Probe tạm: `quicknode-probe` (đã xoá), `alchemy-probe` (nên xoá sau khi chốt).

Kết luận đo lường: **gói free của cả QuickNode và Alchemy không dùng được cho quét log** —
giới hạn 5–10 block/lần khiến số request tăng 200–1000 lần và lập tức chạm rate limit.

## 3. Có thể dùng `blxrbdn` làm hệ thống chính hay không?

`bsc.rpc.blxrbdn.com` (bloXroute) hiện là endpoint duy nhất trong 9 nguồn công khai cho phép
`eth_getLogs` span 5000 block, và trong toàn bộ các tick đã chạy nó đạt 0 lỗi.

### Được (kỹ thuật)
- Span 5000 block ≈ 4 giờ chuỗi BSC/1 call ⇒ đủ để bắt kịp và giữ watermark sát head.
- Không cần key, không quota tính tiền, không có bước ký hợp đồng.
- Scanner đã có sẵn lớp phòng hộ không phụ thuộc 1 endpoint: rotation 10 endpoint,
  `maxFailures 3`, timeout 12s/20s, `scanner_block_gaps` giữ block chưa đọc được, watermark
  không nhảy qua block chưa xác nhận, `provider_unavailable` + cảnh báo admin thay vì im lặng
  báo "không có giao dịch mới".

### Không nên coi là **nguồn chính duy nhất** (rủi ro vận hành)
1. **Không có SLA, không có hợp đồng.** Endpoint công khai có thể siết span, chặn IP Deno, hoặc
   tắt bất cứ lúc nào — không ai thông báo trước. Đúng kiểu sự cố Moralis vừa rồi, chỉ là lần
   này ta không có cả hoá đơn để khiếu nại.
2. **Không có hạn mức riêng.** Đang dùng chung với toàn thế giới; giờ cao điểm span 5000 có thể
   bị từ chối mà không có cách tăng quota.
3. **Điểm chết đơn lẻ cho `getLogs`.** 9 endpoint khoẻ nhưng 8 endpoint còn lại chỉ cho 25–50
   block/lần. Nếu `blxrbdn` gãy, span rơi từ 5000 → 50 ⇒ chậm gấp ~100 lần, thực tế là mù lại.
4. **Không kiểm chứng được tính đầy đủ của log.** Nguồn miễn phí từng trả `null` cho 18% block
   (ghi nhận 18/08). Với dữ liệu tài chính, thiếu log = thiếu tiền vào, và ta không có đối tác
   để đối chiếu trách nhiệm.

### Khuyến nghị
- **Ngắn hạn (đang chạy):** giữ `blxrbdn` làm nguồn `getLogs` chính, Alchemy/QuickNode free cho
  call thường, 8 endpoint còn lại dự phòng. Chấp nhận được vì đã có watermark + gap + cảnh báo.
- **Trung hạn (nên làm):** mua **1 key trả phí** (QuickNode Build ~$49/tháng hoặc Alchemy
  Growth tương đương) đặt lên đầu `logsEndpoints()` với maxSpan lớn, hạ `blxrbdn` xuống dự
  phòng số 1. Chi phí này vẫn thấp hơn Moralis Pro ~$199 và combo Moralis+Etherscan ~$248.
- **Việc kỹ thuật kèm theo khi có key trả phí:** chỉ cần nâng `maxSpan` trong `logsEndpoints()`,
  không phải viết lại scanner.

Câu trả lời gọn: **dùng được để không mù ngay hôm nay, nhưng không nên là chỗ dựa duy nhất cho
dữ liệu tài chính lâu dài.**

## 4. Việc còn treo
1. Confirm backfill vùng mù 31/08 → nay (lùi watermark; ERC20 ~2h, native ~20–30h, ghi idempotent).
2. Xoá `alchemy-probe` sau khi chốt cấu hình.
3. Vá cảnh báo Moralis 401 "usage paused" (12 ngày chết mà 0 notification).
4. Hash giao dịch 84 triệu CAMLY của funtreasury — chưa có.
