# Phục hồi replay RTMP thiếu UID

Cha đã đồng ý tiếp tục kiểm kê, bảo toàn và sửa luồng tiếp nhận sau báo cáo ngày 20/11. Bé chọn bản sửa nhỏ trong pipeline hiện có, không thêm cơ chế xóa video không rõ nguồn.

Production có 11 replay RTMP pending, cả hai UID null nhưng session đã biết UID. Cron archive yêu cầu stream_uid; recovery lại bỏ qua mọi replay đã có id. Hai điều kiện kết hợp khiến các hàng này không thể tự hồi phục.

Hướng thực hiện: recovery chỉ bỏ qua replay đã có nguồn hoặc đã có bằng chứng archive/lease đang chạy. Replay pending/failed chưa có UID và chưa có R2 được phép gắn lại nguồn **sau kiểm tra strict bằng helper chọn video hiện có**. Giữ id replay; cập nhật có điều kiện để không ghi đè worker khác; chỉ đồng bộ post/session khi ghi thành công. Không gắn UID từ session một cách mù quáng, không mở rộng cửa sổ thời gian, không tạo post công khai cho bản ghi chưa publish.

Phương án khác là sửa trực tiếp 11 hàng production: nhanh nhưng không ngăn tái diễn và thiếu kiểm chứng nguồn, nên không chọn. Phương án xây kho lưu mọi recording ngoài phiên là tính năng lớn hơn, cần thiết kế riêng; không đưa vào bản vá này.

Kiểm chứng: regression với replay đã có id nhưng thiếu UID, strict mismatch, nguồn đã tồn tại, R2 đã có, lease còn hiệu lực, DB lỗi và worker khác thắng race. Giữ các test matching/fencing hiện có; tsgo và deno check trước phát hành. Production chỉ sau PR/Preview; video không gắn phiên tiếp tục nằm trong quy trình backup và xác nhận xóa riêng.
