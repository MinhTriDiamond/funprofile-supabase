# Vá hiệu năng trang Profile — 15/10/2026

**Trạng thái: ĐÃ ÁP DỤNG TRÊN PRODUCTION** (database `tljfqavndndfsvtazibe`) ngày 15/10/2026 bởi Angel Muse, theo yêu cầu của Trí (trang profile load chậm, có khi không load được bài). Không thay đổi code app và không đổi chữ ký/kết quả của bất kỳ hàm nào.

## Nguyên nhân 1 — dòng thời gian profile (mức nghiêm trọng nhất)
Trang profile (`useProfile.fetchTimelinePage`) chạy song song 3 nhánh và **chỉ cần 1 nhánh lỗi là toàn bộ dòng thời gian sập** (Promise.all + throw). Nhánh "bài quà tặng" lọc theo `gift_sender_id` + `post_type='gift_celebration'` — bảng `posts` (194.808 dòng) **không có index cho cột này**:
- Đo trên production (pg_stat_statements): trung bình **1.016 ms**, đỉnh **7.487 ms** / lần mở profile.
- EXPLAIN trường hợp xấu nhất: planner đi dọc index toàn cục theo thời gian, lọc từng dòng — quét **toàn bộ 194.808 dòng**, **3.175 ms**, trả 0 dòng.
- Đỉnh ~7,5 giây chạm ngưỡng chờ của PostgREST → request lỗi → **không load được bài nào** dù 2 nhánh còn lại vẫn tốt. Đây là cơ chế của triệu chứng "có khi không load được post luôn".
- Nhánh bài chính (`user_id`) không có vấn đề: 2,6 ms nhờ `idx_posts_user_created`. Hàm bài chia sẻ `get_profile_shared_posts` cũng khỏe: 14,7 ms.

**Cách vá** (`step1-gift-index.sql`): index từng phần `(gift_sender_id, created_at DESC) WHERE post_type='gift_celebration' AND deleted_at IS NULL` (tạo bằng CONCURRENTLY, không khoá bảng). Sau vá: **3.175 ms → 11,6 ms** ở trường hợp xấu nhất (~1 ms ở trường hợp thường).

## Nguyên nhân 2 — bảng vinh danh `get_user_honor_stats`
Hàm chạy ~24 truy vấn gộp trên toàn bộ lịch sử tương tác của user (reactions 606K dòng, comments, shares…) mỗi lần mở profile: trung bình **1.565 ms**, đỉnh **16.934 ms** (113 lần gọi trong cửa sổ đo). Index các bảng liên quan đã có đủ — chậm do thiết kế tính lại từ đầu.

**Cách vá** (`step2-honor-cache.sql`, cùng khuôn mẫu với vá Gift buổi sáng):
- Logic gốc giữ nguyên 100%, đổi tên thành `get_user_honor_stats_compute`.
- Hàm công khai cùng tên chuyển sang đọc bảng cache `user_honor_stats_cache`; user chưa có cache thì tính một lần rồi lưu.
- Cache quá 5 phút: vẫn trả ngay số đã lưu, đồng thời xếp hàng làm mới ở nền (bảng queue + pg_cron `honor-stats-refresh-drain` mỗi phút, job 85 — job SQL nội bộ, hàng đợi rỗng thì gần như 0 chi phí, không sinh log HTTP/Edge).

**Kiểm chứng:** 3 user mẫu (user đăng nhiều nhất 7.658 bài, user tặng quà nhiều nhất, và chính Trí): kết quả trước/sau **giống hệt 14/14 chỉ số**; hàm khi cache ấm **6,8 ms**; chu trình làm mới nền (đánh dấu cũ → gọi hàm → drain) chạy đúng.

**Đánh đổi:** số vinh danh có thể trễ tối đa ~5 phút + thời gian drain (giây) — bảng thống kê hiển thị, không ảnh hưởng luồng nhận thưởng thật.

## Rollback
Chạy `rollback-profile.sql` + `rollback-honor-original.sql` (định nghĩa gốc của hàm vinh danh).
