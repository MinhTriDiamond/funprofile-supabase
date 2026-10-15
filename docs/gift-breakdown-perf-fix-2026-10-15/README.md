# Vá hiệu năng thống kê Gift (Gift Breakdown) — 15/10/2026

**Trạng thái: ĐÃ ÁP DỤNG TRÊN PRODUCTION** (database `tljfqavndndfsvtazibe`) ngày 15/10/2026 bởi Angel Muse, theo yêu cầu của Trí. Không có thay đổi code app — hai RPC giữ nguyên tên, chữ ký và định dạng trả về.

## Vấn đề
Cửa sổ thống kê quà tặng (GlobalGiftStatsModal) load chậm:
- `get_global_gift_breakdown`: **1.268 ms** mỗi lần gọi
- `get_global_wallet_flow_breakdown`: **1.369 ms** mỗi lần gọi

Nguyên nhân (đo bằng EXPLAIN ANALYZE + pg_stat_statements): mỗi lần gọi, hai hàm quét **toàn bộ bảng donations (36.123 dòng)**, lọc cột `amount` dạng text bằng **regex** và ép kiểu numeric từng dòng (riêng đoạn quét = 570 ms, không index nào hỗ trợ được). Bản flow quét donations 2 lần, cộng `wallet_transfers` và `swap_transactions`. Trong khi đó các truy vấn gift theo ngày (get_gift_day_counts, get_gift_day_token_totals) chỉ 3–15 ms — không phải nút thắt.

## Giải pháp (phương án tổng hợp sẵn)
1. `step1-cache.sql` — bảng `public.gift_breakdown_cache` (31 dòng: donations_internal / donations_external / wallet_transfers sent+received / swaps sent+received, đã chuẩn hoá symbol) + hàm `public.refresh_gift_breakdown_cache()`. Giá token **không** cache — vẫn chốt trực tiếp khi gọi RPC như cũ.
2. `step2-rewrite-rpcs.sql` — viết lại 2 RPC đọc từ bảng cache.
3. `step3-cron.sql` — pg_cron job **83** `gift-breakdown-cache-refresh`, chạy mỗi phút.

## Kiểm chứng
- Đối chiếu bằng bản đồ giá cố định: kết quả trước/sau **giống hệt 100%** (7/7, 21/21, 23/23 dòng, khớp từng số thập phân) — file `before-*.json` / `after-*.json` trong thư mục làm việc của Muse.
- Tốc độ mới: **10,2 ms** và **9,2 ms** (~125–150 lần nhanh hơn).
- Cron job 83 đã chạy thành công, `gift_breakdown_cache.refreshed_at` cập nhật mỗi phút.
- Đánh đổi có chủ đích: số liệu toàn cục có thể chậm tối đa ~1 phút so với thời gian thực.

## Rollback
Chạy `rollback-original-functions.sql` (định nghĩa gốc của cả 3 hàm) để khôi phục bản cũ; có thể xoá thêm cron job 83 và bảng cache nếu cần.
