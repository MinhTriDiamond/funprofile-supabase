# Bình luận live bị trùng — 26/11/2026

## Bằng chứng và phạm vi

Đọc public SELECT của đúng buổi live trong ảnh (không gửi thử production) thấy hai row khác ID, cùng người gửi/cùng nội dung, cách nhau khoảng34ms. Vì vậy đây là hai bản ghi thật, không chỉ một row được vẽ hai lần. Receipt chỉ gồm ID/thời gian lưu riêng trong .local-backups/live-comment-duplicate-2026-11-26.

Luồng gửi trước sửa không có khóa trong lúc getSession/INSERT đang chờ; composer để Enter/nút gửi gọi lại cùng nội dung. Realtime có lọc ID nhưng chưa xác nhận bản ghi từ phản hồi INSERT, và initial history có thể ghi đè bình luận mới đến.

## Thay đổi

- Khóa đồng bộ trước await ở useLiveMessages: cùng session+nội dung khi đang gửi dùng chung một yêu cầu. Khóa được giải phóng cả thành công/thất bại, không có cooldown cấm người dùng chủ động lặp lại sau khi đã gửi xong.
- INSERT trả canonical row bằng select/single; phản hồi và realtime đều hòa giải theo server ID, thay placeholder optimistic, không khử trùng theo nội dung các row đã lưu. ID optimistic dùng bộ đếm riêng, không va chạm trong cùng mili giây.
- History tải chậm hòa vào state thay vì ghi đè; phản hồi realtime/send của session cũ không chèn vào session mới.
- Composer host desktop/mobile, viewer và chat dùng khóa gửi, trạng thái nút chờ. Các ô xử lý Enter ở host desktop/viewer/chat bỏ qua IME và key repeat; mobile giữ submit form native. Nội dung nhập tiếp khi đang chờ được giữ; gửi lỗi giữ lại để thử lại.
- Không migration, không đổi quyền/RLS, không xóa bình luận cũ và không ngắt live. Hai row cũ là hai bình luận đã lưu; không tự gộp theo text để tránh làm mất bình luận lặp có chủ ý. Đây là khóa yêu cầu đang chạy ở client, không phải idempotency backend xuyên thiết bị hoặc lần thử lại sau mất phản hồi.

## Kiểm chứng

- 7 hook tests: hai lần gửi trước auth xong→1write; response→realtime, realtime→response, realtime lặp; history chậm; rollback/retry; lặp chủ ý; đổi session.
- 3 composer tests: Enter hai lần+click→1call, bỏ qua IME/key repeat, giữ text mới/giữ text lỗi và mở khóa retry.
- Chrome thật dùng HostLiveChatPanel + useLiveMessages thật/backend giả chậm, chặn mạng ngoài localhost:1write/1dòng/count1 dù realtime lặp; gửi lại chủ ý sau hoàn tất→2write/count2. Không bình luận production. Receipt: browser-proof.json.
- 727 test offline đạt/53 skip/109 file; tsgo và build đạt. Không chạy live test tài chính. Self-review tác giả, không review độc lập.

## Phát hành / rollback

PR→Preview đúng commit→merge; Cloudflare Pages phát hành từ main. Khôi phục bằng PR revert commit sửa. Dữ liệu production hiện có không thay đổi; không có backend/secrets cần phục hồi.
