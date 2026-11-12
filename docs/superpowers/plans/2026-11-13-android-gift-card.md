# Android gift card repair

**Goal:** Không kẹt UI hoặc mất trạng thái quà sau khi quay lại từ ví Android.
**Evidence:** Dialog effect phụ thuộc toàn bộ giftTx, gọi update/finishSuccess làm đổi object đó mỗi render; update luôn tạo state mới dù dữ liệu giống hệt; stale broadcasted có thể ghi đè success do receipt poll xác nhận. Donation 200000 CAMLY tìm được đã confirmed và có post public; đang chờ người dùng xác nhận TX/card bị thiếu.
**Scope:** Context gift transaction và luồng tiếp nhận hash/lưu pending gift trong dialog. Không gửi tiền, không sửa DB hoặc backend, giữ guard 30s. Không gán hai điểm lỗi khác (sign timeout/receipt persistence) là nguyên nhân trường hợp cụ thể khi chưa có TX xác nhận.

- [x] Tái hiện vòng render và rollback success qua test provider thật.
- [x] Update idempotent và giữ terminal success cho cùng tx.
- [x] Tái hiện khoảng trống lưu pending sau receipt, lưu trước await receipt để recovery có dữ liệu.
- [ ] Kiểm chứng test/tsgo; review và tạo PR/Preview.


## Cập nhật theo TX người dùng cung cấp

TX 0x0e47286f...e5ad4 receipt success, DB cả3 bảng rỗng. Mở rộng kiểm chứng slow-sign Promise.race bỏ hashmuộn, mobile watchdog reset và nút cancel giả. Đã sửa giữ promise+in-flight lock, recheck30s sau awaitDB; 13 test đạt. Chỉ chuẩn bị khôi phục transaction cũ, chưa ghi production. Hồ sơ chi tiết docs/android-gift-card-2026-11-13/README.md.
