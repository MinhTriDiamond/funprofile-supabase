# Hộp thư của Angel Ái Vân

> Việc mới nhất nằm ở trên cùng. Mỗi mục ghi rõ: ngày · người làm · việc · phạm vi · branch · trạng thái.

---

## 2026-10-22 — Angel Ái Vân (cùng Angel Muse) — ĐANG LÀM

- **Bước 1 đã xong:** Angel Ái Vân đã thông báo vào nhóm Telegram Coordinator trước khi bắt đầu (xác nhận 09:38, 2026-10-22).
- **Việc:** Sửa lỗi fun.rich sập toàn trang khi người dùng đăng bài kèm ảnh trên laptop. Người dùng báo "đăng bài kèm ảnh 2.34MB thì trang break, đã xảy ra nhiều lần"; ảnh chụp lỗi cho thấy màn hình ErrorBoundary toàn cục với lỗi React `Failed to execute 'insertBefore' on 'Node' — NotFoundError` trong `vendor-react`.
- **Kết quả điều tra trước khi sửa (đã kiểm chứng trong code):** KHÔNG phải lỗi dung lượng — giới hạn ảnh là 20MB phía client (`src/config/uploadLimits.ts`), 100MB phía server (edge function `get-upload-url`), và ảnh đăng bài được nén phía client rồi tải thẳng lên R2 bằng presigned URL. Giả thuyết chính: Chrome Translate / extension sửa DOM bên ngoài React, chạm đúng lúc bấm Đăng — khi app chèn "bài đăng tạm" (optimistic ghost post) lên đầu feed, đóng hộp soạn và thay bằng bài thật (`FacebookCreatePost.tsx` + `src/lib/optimisticFeed.ts`). Cần test A/B của người báo (tắt dịch / tab ẩn danh) để chốt; đợt sửa này xử lý phần chắc chắn đúng trong mọi trường hợp.
- **Phạm vi sửa (chỉ trong các file này):**
  - `src/lib/appUpdateRecovery.ts` — thêm nhận diện nhóm lỗi DOM bị sửa bên ngoài (`insertBefore` / `removeChild` NotFoundError), cơ chế tự phục hồi bằng reload tại chỗ tối đa 1 lần trong 60 giây (dùng chung ngân sách reload toàn cục sẵn có), và hàm gom thông tin chẩn đoán nhẹ (user agent, ngôn ngữ trang, cờ trang-đang-bị-dịch `translated-ltr/rtl`).
  - `src/components/ErrorBoundary.tsx` — khi gặp nhóm lỗi DOM trên thì kích hoạt tự phục hồi thay vì đứng ở màn hình chết; log chẩn đoán kèm lỗi.
  - `src/lib/appUpdateRecovery.domRecovery.test.ts` — test mới cho phần nhận diện lỗi + chẩn đoán.
- **KHÔNG thuộc phạm vi:** luồng upload/media, chặn dịch toàn trang (thành viên nước ngoài cần dịch để đọc bài tiếng Việt), database, Edge Functions. Nếu phạm vi cần mở rộng sẽ dừng và ghi thư cập nhật trước khi làm tiếp.
- **Branch:** `fix/aivan-upload-insertbefore-crash` (tách từ `main` mới nhất `9a6a7ab1`).
- **Trạng thái:** ĐANG LÀM — thư này ghi TRƯỚC khi sửa code theo quy trình; tiếp theo: sửa trong phạm vi → qua cổng Preview Cloudflare của đúng branch → PR + merge → ghi thư kết quả vào chính mục này.
