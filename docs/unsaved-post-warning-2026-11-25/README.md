# Cảnh báo rời bài đang soạn — 25/11/2026

## Hiện trạng và thay đổi

Composer đã có xác nhận tiếp tục/lưu nháp/bỏ bài và beforeunload khi hộp thoại mở. Tuy nhiên, sau khi đóng hộp thoại để gửi create-post nền, loading bị xóa sớm và cảnh báo rời tab bị gỡ trước khi server trả kết quả. Nút quay lại nhiệm vụ cũng đi thẳng mà không qua xác nhận.

- Giữ trạng thái đang đăng và khóa gửi trùng cho tới khi server trả kết quả. beforeunload hoạt động khi đang đăng hoặc còn media tải nền, kể cả hộp thoại đóng.
- Đóng khi đang chuẩn bị/gửi bài: giải thích chưa xác nhận đăng thành công, đề nghị ở lại; không cung cấp thao tác hủy giả khi server có thể đã nhận bài.
- Khi còn nội dung chưa đăng: giữ ba lựa chọn tiếp tục, lưu nháp và bỏ bài; nói rõ bỏ sẽ xóa nội dung. Khi video còn tải, giải thích đóng tab có thể gián đoạn upload.
- Quay lại nhiệm vụ đi qua cùng xác nhận. Hủy xác nhận bỏ đích điều hướng đang chờ.
- Lưu nháp thất bại giữ hộp thoại và nội dung, báo lỗi; không thông báo thành công giả. Khóa các lựa chọn trong lúc lưu nháp.
- Không đổi backend, kho video, dữ liệu bài thật hoặc chính sách video. Không cam kết upload tiếp sau đóng tab.

## Kiểm chứng

- 6 kiểm thử trên composer thật với backend giả: trống/nội dung/bỏ/tiếp tục, lưu nháp lỗi, gửi nền thành công và thất bại, upload còn chạy sau lưu nháp/đóng, yêu cầu đóng khi đang chuẩn bị gửi.
- Chrome local chạy composer thật với backend giả: native beforeunload khi reload bài nháp và khi gửi nền với dialog ẩn; dismiss giữ trang; đóng dialog có xác nhận; thành công gỡ cảnh báo. Không đăng bài production.
- 714 test offline đạt, 53 skip, 106 file; không chạy live test tài chính. tsgo đạt. Build kiểm tra trước commit.
- Self-review bởi tác giả, không có review độc lập.

## Giới hạn trình duyệt

Chrome quyết định câu chữ của hộp cảnh báo rời trang. Cần tương tác người dùng và không bảo đảm hiện khi hệ điều hành buộc tắt ứng dụng hoặc trên mọi luồng đóng trình duyệt mobile. Cơ chế nháp hiện có được giữ nguyên; thao tác beforeunload không bảo đảm ghi nháp bất đồng bộ hoàn tất. Tham khảo: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event

## Phát hành và khôi phục

Đi qua PR và Preview đúng commit trước merge; Cloudflare Pages tự triển khai từ main. Có thể khôi phục bằng PR revert commit sửa này. Chỉ frontend/i18n/test, không có migration hay đổi secrets.

## Kết quả phát hành

PR [#89](https://github.com/MinhTriDiamond/funprofile-supabase/pull/89) đã merge `1ce86df`, nhánh sửa đã xóa. Preview đúng commit `fe843d6`: https://06e7457f.funprofile-supabase.pages.dev đã kiểm tra render bằng Chrome.

Kiểm tra bổ sung đóng tab Chrome bằng `runBeforeUnload` trong context riêng đạt: có dialog loại beforeunload; dismiss giữ tab mở. Bộ harness chỉ giả lập backend/user local, không sử dụng phiên đăng nhập thật và không đăng bài trên production. Kết quả local không thay thế việc bảo đảm hành vi mọi trình duyệt/mobile.
