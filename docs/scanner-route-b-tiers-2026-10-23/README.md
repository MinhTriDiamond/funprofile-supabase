# Chân B (Route B) - quét theo 3 tầng hoạt động ví + luân phiên endpoint Alchemy

Ngày: 2026-10-23. Người phụ trách: bé Minh Trí (Angel Muse thực hiện).
Hàm: `scanner-transfers-tick` (edge function) - PR #21, merge `c58241ed`, deploy production version 33.

## 1. Chẩn đoán: vì sao chân B im lặng từ 19/10/2026

- Tick cuối của mode `transfers_route_b`: 2026-10-19 05:05:42 UTC, trạng thái ok, watermark đứng ở block 128.495.132 trên 1.050 ví. Cron job 81 vẫn gọi hàm mỗi 5 phút đều đặn.
- Gọi thử trực tiếp hàm ngày 23/10/2026, phản hồi nguyên văn: `alchemy eth_blockNumber err=Monthly capacity limit exceeded` - gói Alchemy free (30M CU/tháng) đã hết hạn mức tháng. Hàm chết ở lời gọi Alchemy đầu tiên, trước khi kịp ghi telemetry, nên bên ngoài chỉ thấy im lặng.
- Vì sao cháy nhanh: vòng quét cũ đi vòng tròn đều mọi ví bất kể hoạt động. Cả đời chân B (13-19/10, 1.640 lượt): 3.525 ứng viên nhưng chỉ 27 donations là mới thật; 85%+ ví không có giao dịch nào trong 30 ngày vẫn bị quét như ví nóng. Cộng thêm đợt quét bù sau migration.
- Chân chính (scanner-rpc-tick) không chết theo vì dùng chùm 5 endpoint (4 endpoint công cộng miễn phí + Alchemy); gọi thử 23/10 vẫn ok, rpc_healthy=5.

## 2. Thiết kế v2

Ba thay đổi trong `supabase/functions/scanner-transfers-tick/index.ts`:

1. **Chọn lô ví theo 3 tầng hoạt động** (từ bảng transactions 90 ngày gần nhất, đọc theo trang):
   - Nóng - có giao dịch trong 30 ngày: ghé mỗi 2 giờ.
   - Ấm - giao dịch trong 31-90 ngày: ghé mỗi 24 giờ.
   - Lạnh - còn lại: ghé mỗi 96 giờ (4 ngày). Không ví nào bị bỏ hẳn; token vào ví lạnh vẫn được chân chính bắt theo log toàn chuỗi, chân B lạnh chỉ là lớp đối chiếu bù (BNB native + kiểm tra chéo).
   - Ưu tiên trong lô: tầng nóng trước, quá hạn lâu nhất trước, watermark thấp nhất trước. Lần ghé thăm gần nhất lấy từ `updated_at` của `scanner_transfers_watermarks`.
2. **Nhiều endpoint Alchemy luân phiên**: biến secret `ALCHEMY_BSC_RPC_URLS` (các URL ngăn bằng dấu phẩy) được ưu tiên; chưa có thì fallback biến đơn `ALCHEMY_BSC_RPC_URL` cũ. Endpoint nào báo hết hạn mức tháng sẽ bị đánh dấu chết trong lượt đó và hàm chuyển ngay sang endpoint kế tiếp. LƯU Ý QUAN TRỌNG: hạn mức free là theo TÀI KHOẢN Alchemy - nhiều app/key trong cùng một tài khoản vẫn dùng chung một bể 30M CU; chỉ key thuộc tài khoản khác nhau mới cộng dồn hạn mức.
3. **Đọc watermark theo trang** (1.000 dòng/lượt): sửa lỗi trần PostgREST khiến các ví cuối bảng bị bỏ sót - chính là lỗi "vòng quét giậm chân" đã ghi nhận ngày 14/10/2026.

Telemetry: summary và tick log nay có `tiers`, `due_now`, `batch_tiers`, `alchemy_endpoints`, `endpoints_dead`, và `rpc_endpoint_stats` theo từng endpoint (`alchemy#1`, `alchemy#2`...). Phần đếm tầng chạy TRƯỚC lời gọi Alchemy nên lượt chạy vẫn báo cáo được kể cả khi Alchemy đang hết hạn mức.

## 3. Mô phỏng trên dữ liệu production thật (23/10/2026)

- Vũ trụ ví (từ profiles): 958 ví. Tầng: nóng 90, ấm 47, lạnh 821.
- Mô phỏng 7 ngày tick 5 phút với đúng thuật toán đã deploy: ngày ổn định khoảng 261k CU/ngày → **khoảng 7,8M CU/tháng**, vừa gói free 30M với dư địa gấp khoảng 4 lần. Ngày đầu xả hàng tồn (mọi ví đều quá hạn vì chân B đã đứng 4 ngày) khoảng 470k CU, một lần duy nhất.
- TypeScript check trên file đã sửa: 0 lỗi.

## 4. Kiểm chứng sau deploy (23/10/2026)

- Hàm production: version 32 → 33, ACTIVE, verify_jwt giữ nguyên (false).
- Gọi thử trực tiếp: phản hồi có `wallets_tracked: 958`, `tiers: {hot: 90, warm: 47, cold: 821}` - khớp tuyệt đối với mô phỏng; `alchemy_endpoints: 1` (mới có secret cũ); lỗi vẫn là hết hạn mức ở key cũ và `endpoints_dead: 1` - cơ chế luân phiên đã nhận diện đúng endpoint chết.
- Kết luận: code v2 đã sống trên production và chạy đúng trên dữ liệu thật. Chân B sẽ tự quét tiếp ngay khi có hạn mức: chu kỳ tháng mới mở lại, hoặc bật Pay As You Go, hoặc thêm key thuộc tài khoản Alchemy khác vào secret `ALCHEMY_BSC_RPC_URLS`.

## 5. Cách thêm key bổ sung (việc phía bé Trí)

1. Tạo app Alchemy ở một TÀI KHOẢN khác (đăng nhập khác) - cùng tài khoản thì không thêm được hạn mức.
2. Vào Supabase Dashboard → project FUN Profile Supabase → Edge Functions → Secrets: tạo/cập nhật secret `ALCHEMY_BSC_RPC_URLS` với giá trị là các URL HTTPS của BSC, ngăn bằng dấu phẩy, ví dụ: `URL_cũ,URL_mới`. Không gửi key qua chat.
3. Báo lại để kiểm chứng: trong tối đa 5 phút, tick của chân B sẽ chạy qua endpoint mới; dấu hiệu sống lại = tick `transfers_route_b` mới trong `scanner_tick_log` và watermark bắt đầu nhích.
