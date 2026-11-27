# Composer desktop rộng và xem trước — 27/11/2026

Hộp thoại cũ giới hạn640px trên desktop, nhiều khung/ảnh đại diện lặp; mọi trường và media xếp dọc nên phải cuộn nhiều. Desktop từ1024px nay dùng toàn viewport: cột soạn420–640px và cột preview rộng, mỗi cột cuộn riêng. Header và nút Đăng nằm ngoài vùng cuộn; không thêm route hoặc auth guard.

- Tái sử dụng cùng state/callback composer, không nhân đôi editor hoặc upload. Preview chỉ đọc text/privacy/context và tối đa5thumbnail theo sortOrder; ảnh contain, không phát/tải thêm bản video. Ảnh lazy và chỉ hiện preview trên desktop.
- Bớt viền/shadow/avatar lặp, thumbnail quản lý gọn, toolbar4cột. Gợi ý và AI có phần mở rộng; toolbarAI vẫn mở đúng phần hỗ trợ. Giữ chức năng hiện có; không thêm tính năng placeholder mới.
- Paste/drag/drop qua workspace hai cột; giữ validation, upload nền, draft và leave warning. Tablet/mobile giữ một cột và focus-writing; workspace vẫn flex/min-height0 để cuộn tới media/công cụ. CSS desktop có selector riêng, không sửa dialog global.
- Không thay backend, Light Score rule, giới hạn media, quyền xem, pipeline/backfill video đang chạy. Preview là minh họa nội dung đang soạn, không phải một bài đã đăng.

## Kiểm chứng

Chrome dùng composer/components thật, Vite/Tailwind thật, backend/upload/draft giả; chặn request ngoài localhost. 1024/1440/1920px desktop đủ chiều rộng viewport, footer bottom899 tại viewport900, không overflow ngang; tablet768 vẫn dialog640px, mobile390 vẫn một cột. Tại1440, cột soạn603,95px và preview834,05px.

Gõ text/3ảnh, đổi quyền sang private, xóa ảnh và drop vào preview đều đồng bộ; ảnh contain. Công cụ AI mở được. Text dài/URL dài không tràn, preview cuộn600px độc lập; đóng→tiếp tục giữ nội dung. Mobile editor cuộn500px tới media/công cụ; native reload có beforeunload, dismiss giữ trang. Lưu nháp giữ text/private/3media. Không đăng bài production.

2unit test preview bảo vệ source local/sortOrder/privacy và không tải/phát video lặp;6regression composer đạt (bao gồm save lỗi, gửi nền, unload). Toàn bộ753test offline đạt/53skip/112file; tsgo đạt, build cuối22,24s đạt. Self-review của tác giả, không review độc lập.

Ảnh chỉ dùng nội dung mô phỏng: [desktop](desktop.png), [mobile](mobile.png). Số liệu trong browser-proof.json. Preview Cloudflare xác minh render ứng dụng; kiểm composer đăng nhập/luồng ghi dùng fixture local, không tự đăng bài thật.

## Rollback

Revert PR giao diện qua PR mới. Không có migration, dữ liệu, secrets hoặc backend cần phục hồi. Hàng đợi tối ưu video vẫn chạy độc lập.
