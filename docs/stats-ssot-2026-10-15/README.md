# Hợp nhất số liệu toàn app về 1 nguồn sự thật — 15/10/2026

**Trạng thái: ĐÃ ÁP DỤNG TRÊN PRODUCTION** (`tljfqavndndfsvtazibe`) bởi Angel Muse theo yêu cầu của Trí: mọi bảng số liệu (Honor Board cá nhân + toàn app, Gift history, Benefactors, app stats, bảng cộng đồng ánh sáng) phải nhanh, chính xác và **lấy từ 1 nguồn sự thật duy nhất**. Không đổi chữ ký hàm nào; app không cần sửa code.

## Các mâu thuẫn đã tìm thấy (trước khi vá)
1. **Ba công thức thưởng khác nhau cho cùng một user:** bảng vinh danh profile (`get_user_honor_stats`) dùng hệ số hoạt động cũ 5000/1000/1000/1000 + cộng PPLP + sàn đã nhận; bảng toàn app (`get_user_rewards_v2` + `_single`) dùng hệ số cũ **10000/2000/10000** (bài cũ ×2, bình luận cũ ×2, chia sẻ cũ ×10) và thiếu PPLP; `get_my_rewards` lại đếm bạn bè **một chiều** (bảng friendships lưu 1 dòng/cặp nên thiếu một nửa số bạn — ví dụ Trí: 32 thay vì 100) và thiếu sàn đã nhận.
2. **App stats `total_rewards` là số "chết":** `refresh_app_stats_cache` gán cứng phần thưởng hoạt động = 0, chỉ đếm 50.000 × số user (83.450.000) — không phản ánh hoạt động thật.
3. **Chuẩn đọc số tiền không thống nhất:** các hàm leaderboard ép kiểu trực tiếp (chấp nhận "999.") trong khi gift/app-stats dùng regex loại bỏ dạng đó → cùng 1 giao dịch 999 CAMLY nơi tính nơi không. Đã thống nhất chuẩn `^[0-9]+(\.[0-9]*)?$` ở mọi hàm làm mới nền (bao phủ 100% dữ liệu hiện có).

## Kiến trúc sau vá — 3 nguồn sự thật
- **Donations:** `gift_breakdown_cache` (vá buổi sáng) cho gift history + app stats; `donation_board_base` (33.448 dòng đủ điều kiện, làm mới 5 phút — job 86) cho benefactor/recipient/token leaderboard + donation global stats. Chuẩn amount thống nhất ở cả hai.
- **Rewards/Honor:** công thức của `get_user_honor_stats_compute` là chuẩn duy nhất; `user_honor_stats_cache` phủ 1.669/1.669 user (mở rộng thêm 3 cột đếm thô), làm tươi theo lượt xem (hàng đợi + job 85) và theo vòng nền 150 user/5 phút (job 87). `get_my_rewards`, `get_user_rewards_v2`, `get_user_rewards_v2_single` đều đọc từ cache này; `refresh_app_stats_cache.total_rewards` = tổng của cache.
- **Light community:** `user_light_totals` (làm mới 5 phút — job 88), `get_light_community` đọc từ đây.

## Hiệu quả đo được
| Bề mặt | Trước | Sau |
|---|---|---|
| get_user_rewards_v2 (toàn app) | 68.000 ms (chạy đầy đủ) | **14 ms** |
| get_light_community | 1.417 ms | **21,7 ms** |
| get_app_stats | 932 ms | **26 ms** |
| get_benefactor_leaderboard | 1.789 ms | **~265 ms** |
| get_token_leaderboard | ~1.800 ms | **120 ms** |
| get_donation_global_stats | 1.815 ms | **363 ms** |
| get_user_honor_stats (cache ấm) | 1.565 ms | **6,8 ms** |
| get_my_rewards | 972 ms | đọc cache (~ms) |

## Thay đổi số liệu hiển thị (do sửa công thức về chuẩn — có chủ đích)
- Bảng toàn app: **281/1.533 user đổi total_reward** (hệ số cũ bị thổi phồng được chuẩn hoá, cộng thêm PPLP + sàn đã nhận). Ví dụ angelthienhanh68: 23.545.000 → 19.438.181.
- My Rewards: số bạn bè và tổng thưởng nay **khớp từng số** với bảng vinh danh trên profile (kiểm chứng trên 2 user mẫu, mọi trường còn lại giữ nguyên).
- App stats total_rewards: 83.450.000 → **1.357.740.628** (tổng thật theo công thức chuẩn).
- Các bảng donations: kết quả **giống hệt 100%** bản gốc (đối chiếu nguyên tử cùng ảnh chụp: 0 user lệch; 7 bộ tham số JSON khớp từng dòng) — chỉ nhanh hơn, cộng giao dịch "999." nay được tính nhất quán ở mọi bảng.

## Đánh đổi
Mọi số liệu nền có thể trễ tối đa ~5 phút (riêng vinh danh toàn cục: vòng làm tươi đủ 1.669 user ≈ 1 giờ, nhưng user được xem sẽ tươi trong 5 phút). Các job nền đều là SQL nội bộ (không HTTP/Edge, không sinh Log Ingestion); chi phí mỗi lần chạy: gift ~2–3 giây, board base ~3–5 giây, light ~1 giây, honor-stale ~11 giây/150 user.

## Chưa đụng tới (ghi nhận)
- `get_unified_transactions` và họ hàm ví: thuộc lộ trình đã sắp xếp sau phần Livestream của Quang Vũ.
- Điểm ánh sáng hiện có 3 nguồn (`light_actions` tổng, `unified_user_light_score`, `light_reputation`) với ý nghĩa sản phẩm khác nhau (điểm hoạt động / v1+v2 / reputation) — vòng này chỉ tăng tốc bảng cộng đồng theo đúng định nghĩa gốc của nó, không gộp nghĩa.
- Các hàm thống kê admin (founder/unified admin/PPLP admin): tần suất thấp, để vòng sau nếu cần.

## Rollback
Các định nghĩa gốc nằm trong thư mục làm việc của Muse (`stats-audit-2026-10-15/defs/`); `rollback-stats.sql` khôi phục các hàm chính và dỡ các bảng/job mới.
