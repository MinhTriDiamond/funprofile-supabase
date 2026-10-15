# Bổ sung cùng ngày — Vá bảo mật view hợp nhất (sau khi Quang Vũ hoàn thành Livestream)

Vòng bảo mật cho `v_unified_transactions` + `v_unified_transactions_primary` vốn được xếp lịch **sau** phần Livestream của Quang Vũ. Ngày 15/10/2026 Trí báo bé Vũ đã làm xong phần Livestream → vòng này được tiến hành ngay.

## Phát hiện khi rà soát
- `v_unified_transactions_primary`: role **anon có quyền SELECT** → bất kỳ ai có khóa công khai (nằm trong JS của app) cũng đọc thẳng được toàn bộ sổ giao dịch hợp nhất của mọi user qua REST, vòng qua toàn bộ logic phạm vi của họ hàm RPC. `v_unified_transactions`: authenticated có SELECT.
- Bảng `gift_breakdown_cache` (tạo ở vòng vá buổi sáng) **chưa bật RLS** và mang quyền mặc định (gồm cả ghi) cho anon/authenticated → có thể bị ghi đè qua REST. Các bảng nội bộ khác tạo cùng ngày đều đã bật RLS nhưng vẫn mang quyền mặc định thừa.

## Kiểm chứng an toàn trước khi thu quyền
Tải toàn bộ **208 file JS** của bản app đang chạy trên fun.rich và rà soát: **0** tham chiếu trực tiếp tới 2 view và cả 6 bảng nội bộ; app chỉ gọi qua RPC (`get_unified_transactions` xuất hiện đúng như kỳ vọng). Thử truy cập bằng khóa anon trước khi vá: view thực thi truy vấn (HTTP 500 do chính nó timeout — cũng là bằng chứng nó với tới được dữ liệu).

## Đã áp dụng (`step2-view-hardening.sql`)
- Bật RLS cho `gift_breakdown_cache`.
- `REVOKE ALL` từ anon + authenticated trên: 2 view hợp nhất, `unified_transactions_snapshot`, `gift_breakdown_cache`, `donation_board_base`, `user_honor_stats_cache`, `user_honor_stats_refresh_queue`, `user_light_totals`.
- Không đụng service_role/postgres; mọi RPC SECURITY DEFINER và các job làm mới chạy như cũ.

## Kiểm chứng sau vá
- Truy cập trực tiếp bằng khóa anon: **HTTP 401 "permission denied for view"**; quyền còn sót: 0.
- Hồi quy: unified global 715 ms; snapshot refresh 70.280 dòng; gift breakdown, honor stats (Trí 3.381.213), light community, benefactor — tất cả bình thường.
