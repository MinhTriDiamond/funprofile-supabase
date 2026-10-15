# Thống nhất hiển thị số liệu quà tặng — 2026-10-15

Theo yêu cầu của Trí: ba bề mặt thống kê phải dùng cùng một cách tính — đầy đủ token, một con số tổng USD duy nhất, định giá tại thời điểm tặng.

## Đã áp dụng trực tiếp lên database production (Supabase `tljfqavndndfsvtazibe`)

1. **Hàm chuẩn mới `donation_board_usd_total()`** — một nguồn sự thật duy nhất cho tổng USD quà tặng: tổng `amount_usd` (giá đã lưu tại thời điểm tặng) trên `donation_board_base` theo đúng bộ quy tắc bảng vinh danh (confirmed, mainnet, token hợp lệ trong danh mục, trần giá trị mỗi món, loại tài khoản bị loại trừ).
2. **`get_donation_global_stats`** (bảng Benefactor): `totals_by_token` nay liệt kê ĐẦY ĐỦ mọi token có quà — bổ sung FUN (5.281.575,88646 FUN · 1.888 giao dịch) và TONCOIN — với `usd: null` cho token chưa có giá (FUN còn testnet trên chain 97 nên không hiển thị giá, tuyệt đối không hiển thị 0). Các trường tổng khác giữ nguyên.
3. **`get_app_stats`** (HONOR BOARD): `total_sent_usd`/`total_received_usd` chuyển từ "số lượng × giá hiện tại" sang hàm chuẩn ở mục 1. Con số hiển thị đổi từ ~$1.873.474 (giá hôm nay) về $1.368.155,12 (giá tại thời khắc trao tặng).
4. **`get_unified_summary`** (Lịch sử quà tặng): trường mới `totals.total_usd` = hàm chuẩn ở mục 1 (chỉ ở phạm vi global).

## Kiểm chứng

Ba bề mặt cho CÙNG MỘT con số trong cùng một câu lệnh: benefactor = honor board = history = **$1.368.155,12**. Bộ lọc theo khoảng thời gian (tuần/tháng) của bảng Benefactor vẫn hoạt động. Thứ hạng các bảng xếp hạng không đổi (không sửa hàm xếp hạng).

## Phần còn lại thuộc giao diện

- Thẻ token FUN/TONCOIN trên bảng Benefactor xuất hiện khi giao diện đọc `totals_by_token` (dữ liệu đã có sẵn).
- Dòng "Tổng giá trị" trên trang Lịch sử cần giao diện hiển thị `totals.total_usd` từ kết quả hàm tóm tắt.

## Tệp

`step1-unify.sql` (hàm chuẩn + 3 hàm sửa), `step2-fun-listing-fix.sql` (bỏ lọc chain testnet khỏi phần liệt kê FUN), `rollback.sql` (định nghĩa gốc + bỏ hàm chuẩn).
