# Card gift: mở hồ sơ người nhận — 2026-11-14

Người thực hiện: Quang Vũ cùng Angel Muse. Nhánh code: `fix/quangvu-gift-recipient-profile-link`.

## Nguyên nhân và thay đổi

`DonationReceivedCard` có button + senderId cho người tặng, nhưng khối người nhận chỉ là div; interface/adaptor từ Unified History không truyền recipientId. Vì vậy không có hover/click dù tên và avatar đã có.

- Thêm recipientId optional vào dữ liệu biên nhận, truyền từ recipient.user_id của Unified History và các nguồn thông báo quà/lịch sử ví/profile/admin dùng cùng card.
- Tên, username và avatar người nhận nằm trong button; ID hợp lệ thì có cursor pointer, bấm đóng card và mở route `/profile/<id>` hiện hữu; stopPropagation để không kích hoạt thẻ cha.
- Không có profile ID (ví ngoài) thì disabled, không suy ID từ địa chỉ ví hoặc tên hiển thị. Bảo vệ tương tự cho sender ID rỗng.
- Không đổi route registry, backend, schema, dữ liệu giao dịch hoặc token math. Không thay thiết kế/màu của card.

## Kiểm chứng

- 4 test fail trước sửa vì không tìm được nút người nhận; sau sửa 6 integration test đạt trên card thật + MemoryRouter: giao dịch gửi/nhận, detail RPC, ví ngoài, click avatar và liên kết sender.
- tsgo --noEmit và git diff --check đạt. Review độc lập không thấy blocker.
- Full suite: 513 đạt /30 skip /22 fail thuộc nhóm live REST DNS sandbox và file render giá có sẵn; không coi toàn suite pass.
- Preview Cloudflare https://44e49bfc.funprofile-supabase.pages.dev build SUCCESS. Đã dùng Chrome thật mở đúng biên nhận được báo lỗi, click nút recipient ⇒ card đóng ⇒ route profile UUID ⇒ canonical username đúng, trang hồ sơ tải được và có nút Tặng quà. Không tạo giao dịch tiền để thử.

## PR và rollback

PR code #58: https://github.com/MinhTriDiamond/funprofile-supabase/pull/58 — đã merge squash `a4a4f34b4804041ee4cc01bc36dda900e0e871f5` sau cổng Preview đạt; nhánh code đã xóa.

Chỉ frontend: merge kích hoạt Cloudflare Pages production, không cần deploy Edge Function. Rollback nếu cần bằng PR revert #58, không cần khôi phục dữ liệu vì không có thay đổi DB.


## Production

Cloudflare build commit a4a4f34: SUCCESS, deployment https://70c33883.funprofile-supabase.pages.dev. Đã đọc trực tiếp asset production https://fun.rich/assets/index-uOp7jHfP.js và xác minh guard recipientId + button/cursor mới. Preview đã kiểm chứng UI thật; chưa click lại trên production vì trình duyệt đang được người dùng sử dụng, không chiếm tab đang làm việc.

Không sửa dữ liệu production. Nhánh hồ sơ: docs/quangvu-gift-profile-release.
