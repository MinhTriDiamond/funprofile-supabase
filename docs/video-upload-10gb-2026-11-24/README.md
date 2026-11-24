# Video bài viết: hỗ trợ 10 GiB — 24/11/2026

Quang Vũ cùng Angel Muse. Cha đã gửi Telegram trước khi bắt đầu. Code: PR #74, nhánh `fix/quangvu-video-upload-10gb`; hồ sơ phát hành tiếp nối: `docs/quangvu-video-upload-release`.

## Kết quả production

- PR #74 đã merge `c23c44e` qua Preview thành công. Cloudflare production: https://8da68171.funprofile-supabase.pages.dev . `fun.rich` dùng `/assets/index-CmHv55iG.js`, khớp bundle Preview cuối.
- Đã thử lại **đúng video MOV 6:08 từng báo lỗi**, 3.399.337.725 byte, 3402×1916: **65/65 phần, completed** lúc 23:17:25 giờ Malaysia. Giao diện hết lỗi đỏ, nút **Post** được bật. Giữ nguyên bản nháp, không bấm đăng bài.
- Đọc lại object R2: HEAD trả đúng 3.399.337.725 byte, MIME `video/quicktime`; GET Range trả HTTP 206 và đúng 1.024 byte đầu, tổng dung lượng khớp. Không đưa URL hoặc nội dung video vào hồ sơ repo.
- Backend đều ACTIVE: `multipart-upload` v88, `create-post` v88, `get-upload-url` v89. `verify_jwt` giữ nguyên false/false/true; xác thực user trong code vẫn được giữ. Source entrypoint và shared helper tải lại khớp byte với repo.

## Hiện trạng trước sửa và phân tích

Ảnh chỉ báo lỗi upload chung. Metadata bản nháp xác nhận video thực nặng khoảng 3,40 GB (3,17 GiB), progress=0. Query chỉ đọc không có phiên upload mới ngày 24/11 trước sửa. Tài khoản trong ảnh có role admin, vốn đã thuộc mức 10 GiB; không có bằng chứng lỗi này do giới hạn 2 GiB.

Code trước sửa giới hạn tài khoản thường 2 GiB, admin 10 GiB. Multipart đã chia 50 MiB/phần nhưng hàm tính mã tệp gọi `file.arrayBuffer()` trên toàn bộ video trước khi khởi tạo upload. Đây là điểm không phù hợp với tệp nhiều GB. Chưa bắt được tên ngoại lệ của lần lỗi cũ; kết quả kiểm chứng sau sửa là cùng tệp đã tải được đầy đủ, không suy đoán mã lỗi gốc.

## Thay đổi

- Đồng bộ frontend và backend bài viết: tài khoản thường và admin tối đa **10 GiB = 10.737.418.240 byte**, gồm đúng biên; lớn hơn một byte bị chặn. Giữ thời lượng 4 giờ, loại tệp và số lượng media. Giữ chat 2 GiB ngoài phạm vi.
- SHA-256 đọc 8 MiB/lượt và băm toàn nội dung, giữ mã resume 16 ký tự hex giống trước. Không dùng mã lấy mẫu. Khai báo trực tiếp `@noble/hashes` 1.8.0, vốn đã là dependency bắc cầu.
- Mỗi request điều khiển multipart lấy JWT hiện tại từ Supabase để theo phiên đã refresh khi upload lâu.
- Composer hiển thị lỗi đã phân loại: giới hạn, thời lượng, định dạng, 401, không đọc được tệp hoặc lỗi kết nối. Không đưa raw server response hay signed URL vào thông báo.
- Giữ multipart 50 MiB/phần, tối đa 4 worker. Single PUT R2 chỉ hỗ trợ khoảng 5 GiB nên không dùng cho video lớn.
- Không đổi schema, dữ liệu bài viết, RTMP, secrets hoặc các file cấu hình bị cấm.

## Kiểm chứng

- RED trước sửa: frontend/backend chặn tệp trên 2 GiB; hàm hash đọc toàn tệp; request dùng JWT cũ.
- GREEN: **55/55 test trong 11 file**, gồm upload/config/chat/feed. `tsgo --noEmit`, build local và review code đạt.
- Mô phỏng 10 GiB: đủ 205 phần, đúng tổng byte, mỗi phần tối đa 50 MiB và concurrency tối đa 4. Đây là kiểm thử orchestration, không tải 10 GiB qua mạng production.
- Hash 17 MiB + 13 byte khớp node SHA-256 qua nhiều ranh giới chunk; không gọi whole-file arrayBuffer.
- Hash đầy đủ 10 GiB dữ liệu giả lập: 1.280 lượt đọc, tối đa 8.388.608 byte/lượt; mã rút gọn `732377e7f4a2abdc` khớp node crypto. Mất 139.766 ms trên máy kiểm tra.
- Tệp thật được kiểm chứng end-to-end là MOV 3,40 GB; **chưa tải tệp 10 GiB thật qua mạng**.
- Preview code: https://d04bf4e3.funprofile-supabase.pages.dev . Preview head cuối `ceb3748`: https://fbf85b4c.funprofile-supabase.pages.dev . HTTP 200 và bundle xác nhận giới hạn, hash, token.

## Triển khai và khôi phục

Shared helper được đóng gói riêng theo từng Edge Function. Sau merge đã deploy đúng ba consumer bài viết: multipart-upload, create-post, get-upload-url; giữ cài đặt JWT theo manifest trước. Lần deploy từng function trước merge bị auto-review chặn; không thực hiện. Rollout sau merge đã hoàn tất và được đọc lại source xác minh.

`upload-to-r2` là đường legacy body/base64 có giới hạn 4 GiB riêng; Create Post video không dùng đường này. Không mở body 10 GiB qua Edge Function. `delete-from-r2` chỉ dùng helper ownership, không cần deploy.

Source production trước sửa đã tải vào `/private/tmp/video-upload-10gb-audit/before/`; ba entrypoint khớp repo trước sửa. Manifest/hash trong hồ sơ. Có thể dựng lại source từ git base `e7dcc1f`. Khôi phục frontend bằng PR revert; backend deploy lại ba function từ source base, giữ `verify_jwt` false/false/true. Không có schema cần rollback.

## Hồ sơ bằng chứng

- `functions-before.json`, `functions-after.json`: phiên bản và cài đặt xác thực.
- `source-before-sha256.json`, `backend-source-verification.json`: đối chiếu source.
- `preview-verification.json`, `release-verification.json`: Preview và production.
- `hash-10g.json`: phép băm đầy đủ dữ liệu giả lập.
- `actual-upload-verified.json`: lượt tải thật và kiểm tra object R2; URL được lược bỏ.

## Nguồn tham khảo

- R2: https://developers.cloudflare.com/r2/platform/limits/ .
- SHA-256 incremental: https://github.com/paulmillr/noble-hashes/tree/1.8.0 .
- Chưa xác minh được giới hạn Facebook hiện hành từ nguồn chính thức để khẳng định tương đương mọi luồng đăng video.
