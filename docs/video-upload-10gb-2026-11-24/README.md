# Video bài viết: hỗ trợ 10 GiB — 24/11/2026

Quang Vũ cùng Angel Muse. Cha đã gửi Telegram trước khi bắt đầu; nhánh `fix/quangvu-video-upload-10gb`.

## Hiện trạng và phạm vi

Ảnh Create Post: video6:08 báo lỗi chung, không có kích thước/mã lỗi. Query chỉ đọc các phiên upload của user trong ảnh: không có phiên mới ngày24/11; phiên gần nhất23/11 đã completed. Một lần thử lại trên browser thật theo xác nhận riêng vẫn lỗi chung. **Chưa xác định nguyên nhân chính xác của tệp này**, không coi tăng giới hạn là bằng chứng đã sửa lỗi gốc.

Giới hạn code/production shared trước sửa: user2GiB, admin10GiB. Multipart dùng50MiB/part,4worker, nhưng calculateFileHash đọc toàn bộ file.arrayBuffer trước khởi tạo. Chọn giữ multipart hiện có: single PUT R2 chỉ hỗ trợ khoảng5GiB; không dùng hash lấy mẫu vì có thể nhận nhầm phiên resume.

## Thay đổi

- Frontend + backend bài viết: tài khoản thường và admin tối đa10GiB=10.737.418.240byte, bao gồm đúng biên; lớn hơn1byte bị chặn. Giữ thời lượng4giờ, loại tệp và số lượng media.
- Mỗi request điều khiển multipart lấy JWT hiện tại từ Supabase để theo phiên đã refresh khi upload lâu. Test chuyển token sau request kýpart đầu và kiểm tra complete dùng token mới.
- SHA256 đọc8MiB/lượt, hash toàn nội dung, giữ16ký tựhex giống phiên trước. Khai báo trực tiếp@noble/hashes1.8.0 (đã là dependency bắc cầu).
- Composer nhận lỗi đã phân loại: giới hạn, thời lượng, định dạng,401, lỗi đọc tệp, lỗi kết nối; không hiển thị raw server response/signed URL. Lỗi chưa phân loại giữ thông báo chung.
- Chat giữ2GiB ngoài phạm vi; không đổi schema, dữ liệu bài viết, RTMP, secrets hoặc file cấu hình bị cấm.

## Kiểm chứng local

- RED:3ca fail đúng nguyên nhân frontend/backend chặn2GiB và whole-file allocation.
- GREEN:55/55test trong11file (upload/config/chat/feed); test multipart10GiB mô phỏng205part, không cấp phát/tải10GiB thật, kiểm tra tổngbyte và concurrency<=4.
- Hash17MiB+13byte so với node SHA256 khớp, không gọi whole-file arrayBuffer; mỗi lần đọc<=8MiB.
- tsgo --noEmit đạt. Preview/review/deploy bổ sung khi có kết quả.
- Chưa tải tệp10GiB thật qua mạng production; không khẳng định đã kiểm chứng end-to-end10GiB.

## Backend và khôi phục

Shared mediaLimits được đóng gói theo mỗi function; frontend đổi không tự đổi giới hạn production. Cần deploy đúng3consumer bài viết: multipart-upload/create-post/get-upload-url. upload-to-r2 là đườnglegacy nhậnbody/base64 có giới hạn4GiB riêng, không dùng cho video Create Post; không mở body10GiB quaEdgeFunction. delete-from-r2 chỉ dùng ownership helper, không cần deploy.

Bản nguồn production trước sửa đã tải vào /private/tmp/video-upload-10gb-audit/before/;3entrypoint so với repo cùng nội dung. Trước deploy lưu manifest/hash, source từ gitbase e7dcc1f để có thể dựng lại. Khôi phục frontend bằng PRrevert; backend deploy lại3function từ cây source gitbase với cờ verify_jwt giữ nguyên theo manifest. Không rollback schema vì không thay schema.

## Nguồn

- R2: https://developers.cloudflare.com/r2/platform/limits/ (single/multipart limits, đơn vịGiB).
- SHA256incremental: https://github.com/paulmillr/noble-hashes/tree/1.8.0 .
- So sánhFacebook: chưa xác minh được mức hiện hành từ nguồn chính thức; không khẳng định tương đương.
