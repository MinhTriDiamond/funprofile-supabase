# Thiết kế: xử lý video bài viết nền bằng Cloudflare Stream

Trạng thái: **bản đề xuất chờ Cha duyệt**, chưa viết code sản phẩm hoặc triển khai.
Người phụ trách: Quang Vũ cùng Angel Muse. Nhánh: `feat/quangvu-background-video-processing`.

## 1. Yêu cầu và lựa chọn đã chốt

Cha muốn video tải lên được xử lý nền để nhẹ hơn, phát ổn định theo tốc độ mạng và giảm dung lượng bản gốc đang lưu. Cha đã chọn **Cloudflare Stream** thay vì máy chuyển mã riêng. Bước thông báo Telegram đã được Cha xác nhận.

Mức upload ứng dụng giữ 10 GiB/video, tối đa 4 giờ, không đổi số lượng media. Đây là trần ứng dụng; không đồng nghĩa đã thử tải thật tệp 10 GiB qua Stream. V1 xử lý video bài viết thường; không thay quy trình RTMP/replay đang chạy.

Các quyết định còn lại bên dưới là **đề xuất của bé**, chưa coi là Cha đã duyệt. Đặc biệt: thời hạn giữ tệp gốc và sử dụng quota dùng chung.

## 2. Hiện trạng đã khảo sát

- Create Post upload multipart vào R2 rồi lưu URL/size gốc vào `post_attachments` và các trường media của bài viết. Chưa enqueue chuyển mã cho bài viết thường.
- Video MOV thật 6:08, 3.399.337.725 byte vừa tải thành công, nhưng chưa nén/chuyển mã.
- `src/utils/videoCompression.ts` dùng Canvas/MediaRecorder trong LiveHostPage; không phải dịch vụ nền độc lập.
- Có Stream API helper và webhook đã xác thực HMAC. Webhook hiện xử lý live/replay; một account Stream chỉ có một webhook subscription nên cần thêm nhánh xử lý video bài viết vào webhook hiện có, không ghi đè URL đăng ký.
- `stream-orphan-cleanup` đã xét posts/comments/profiles/live, nhưng chưa xét bảng job mới hoặc riêng `post_attachments`. `cleanup-orphan-videos` cũng cần bảo vệ UID của job. Luồng dọn R2 phải giữ nguồn đang xử lý.
- Chưa xác minh quota hiện tại trong phiên khảo sát này. Mốc 1.000 phút là hồ sơ trước đây, không được coi là số trống hiện tại.

## 3. Các hướng đã cân nhắc

1. **Worker FFmpeg riêng + R2:** chủ động bản đầu ra và không tiêu quota Stream; cần hạ tầng chuyển mã/vận hành mới. Cha không chọn hướng này.
2. **Stream, upload trực tiếp TUS:** bỏ một lượt lưu R2, có sẵn phát thích ứng; thay luồng upload vừa kiểm chứng và khó giữ tệp gốc để khôi phục. Chưa chọn trong V1.
3. **Stream lấy tệp R2 sau upload — bé đề xuất:** tái sử dụng multipart đang hoạt động; người dùng không phải upload lần hai, có nguồn để thử lại. Tạm thời lưu cả R2 và Stream cho tới khi nguồn được dọn theo chính sách. Có thêm thời gian Stream lấy và chuyển mã.

Stream tự tạo mức chất lượng theo nguồn, tối đa 1080p theo tài liệu hiện hành. V1 không hứa giữ 4K/HDR hay mọi mức 720p/1080p với mọi nguồn. Giảm dung lượng và thời gian mở video phải đo, không hứa một tỷ lệ nén cố định.

## 4. Luồng đề xuất

1. Người dùng upload như hiện tại vào R2. Chỉ sau khi bài viết/attachment được lưu thành công mới tạo job, tránh chuyển mã các bản nháp bỏ dở.
2. Job tạo trong cùng giao dịch lưu attachment hoặc qua outbox DB idempotent. Không dựa vào tab trình duyệt để duy trì việc xử lý.
3. Bộ điều phối server kiểm tra quyền sở hữu nguồn, kích thước thật, trạng thái bài viết và quota. Gửi URL đọc tệp R2 cho Stream `/stream/copy`; file không đi xuyên RAM Edge Function.
4. UI hiển thị “Đang xử lý video”; bài viết vẫn hiện, thumbnail hiện tại giữ nguyên. Bản gốc có thể phát tạm nếu nguồn/trình duyệt hỗ trợ; nếu không thì giữ placeholder, không tạo trạng thái trống.
5. Webhook có HMAC cập nhật job. Cron định kỳ đối chiếu API để xử lý webhook trễ/mất, không poll toàn bộ thư viện mỗi lần xem feed.
6. Chỉ chuyển nguồn khi API xác nhận đúng UID/account/job, `readyToStream=true`, `status.state=ready` và mọi mức chất lượng hoàn tất. Lấy manifest HLS/thumbnail từ API, kiểm tra manifest và ít nhất một segment có thể đọc.
7. Cập nhật đồng bộ attachment và các trường `posts.video_url/media_urls/metadata` còn được client sử dụng. Player phát thích ứng qua Stream; UI hết trạng thái xử lý.
8. Khi yêu cầu tải xuống, dùng MP4 đã chuyển mã của Stream sau khi download endpoint báo ready. Không đưa manifest HLS vào nút tải tệp. Không tạo MP4 export cho mọi video khi chưa cần nếu làm tăng chi phí không cần thiết.
9. Dọn nguồn R2 theo chính sách mục 6. Video Stream đang được bài viết sử dụng **không** thuộc pipeline archive/xóa nguồn RTMP.

## 5. Job và xử lý lỗi

Dự kiến bảng `post_video_processing_jobs`, duy nhất theo attachment + phiên bản nguồn; tách khỏi `live_replays` và `video_upload_sessions`.

Trường cần thiết: owner/post/attachment, nguồn R2 (key, size, hash), Stream account/UID, phase, attempt count, lease expiry, next retry, last safe error, encoded duration/dimensions, playback/download URLs, verified/ready timestamps, source cleanup due/done, cancellation/deletion intent. Trạng thái lỗi xử lý và lỗi dọn nguồn tách biệt.

Các phase: queued → waiting_capacity → importing → encoding → verifying → ready; failed/cancelled/deleting là nhánh riêng. Lease và compare-and-swap chống hai cron cùng làm; unique key chống webhook/retry tạo job trùng. Sau timeout import không gọi copy lại mù quáng: tìm UID theo correlation metadata trước, đưa vào needs_review nếu chưa biết kết quả.

Retry lỗi mạng/429/5xx có backoff và số lần tối đa cấu hình; lỗi định dạng/hỏng nguồn/quá thời lượng không lặp vô hạn. Không đổi URL sang video chưa xác minh. Khi lỗi giữ bản gốc và thông báo/thử lại phù hợp, không dọn nguồn.

## 6. Giữ bản gốc — cần Cha duyệt

**Đề xuất:** giữ tệp gốc R2 **7 ngày sau khi bản Stream đã được xác minh sẵn sàng**, sau đó mới dọn nguồn của job đó. Tệp đang lỗi/đang xử lý không bắt đầu tính hạn. Không dọn hàng loạt video cũ.

Trước khi dọn: đối chiếu lại Stream còn tồn tại/ready/phát được; không có tham chiếu nào khác cần nguồn; bài viết/job không đổi nguồn; có bản ghi backup/khôi phục và nhật ký thao tác. Lưu một bản MP4 đã chuyển mã phục hồi về R2 trước khi xóa tệp gốc; kiểm tra size/range/thời lượng và lưu key/hash của bản backup. Bản backup tối ưu có thời hạn riêng **30 ngày sau khi dọn gốc**, sau đó dọn theo chính sách đã được duyệt; không tự xóa backup trong đợt thử nghiệm. Không giữ đồng thời gốc + backup + Stream mãi mãi.

**Giới hạn cần hiểu:** backup MP4 không khôi phục đúng tệp MOV/4K gốc. Sau khi hết hạn giữ gốc, tính năng tải xuống trả bản đã chuyển mã; Stream không cung cấp lại exact input. Nếu cần giữ nguyên bản gốc lâu dài thì không đạt mục tiêu giải phóng phần dung lượng gốc đó.

V1 triển khai cơ chế dọn ở chế độ dry-run trước. Bật dọn thật là bước phát hành riêng sau khi Cha chốt chính sách và đã kiểm chứng backup/khôi phục. Thiết kế này chưa là lệnh xóa video hiện có.

## 7. Quota và chi phí

Dùng account Stream đã cấu hình; không tạo account, mua thêm gói hoặc đổi secrets tự động. Mọi video bài viết giữ trong Stream đều tiêu phút lưu, dù bản phát nhẹ hơn. Stream không tính quota lưu theo GB.

Đề xuất để dành **240 phút** cho RTMP, cấu hình được, chỉ nhận job khi dung lượng khả dụng trừ phần dự trữ và reservation của job khác đủ cho thời lượng nguồn. Kiểm tra usage/account thực tế trước bật. Reservation có thời hạn/lease và đối chiếu sau khi Cloudflare báo thời lượng thật; khóa admission theo account tránh nhiều job cùng chiếm một phần quota. Nếu API usage lỗi thì hoãn import, giữ R2, báo “Chờ dung lượng xử lý”.

Thông tin thời lượng từ client không được coi là số liệu tin cậy để cấp quota. Trước khi bật đại trà, phải kiểm chứng cơ chế chặn thời lượng phía Stream cho đường copy: không suy ra request hỗ trợ maxDurationSeconds chỉ vì response có trường này. Trong khi chưa xác minh được hard cap, chỉ chạy canary admin có thời lượng nguồn đã được kiểm tra, reservation bảo thủ 240 phút/job, không mở import tự do cho tài khoản thường. Nếu copy không thể áp hard cap, builder dùng transfer TUS có maxDurationSeconds được Stream áp dụng, đọc từng phần từ R2 bằng backend và lưu offset bền vững; đây vẫn là Stream xử lý nền và không yêu cầu người dùng upload lại. Không giảm phần dự trữ theo duration client chưa xác minh.

Usage đọc từ GET /accounts/{account_id}/stream/storage-usage, trường totalStorageMinutes/totalStorageMinutesLimit; không lọc theo creator khi tính budget account. Khi copy hỗ trợ, ưu tiên tham số input theo API hiện hành thay cho url đã deprecated; cần test thật xác nhận.

Guard của ứng dụng không thể ngăn upload trực tiếp ngoài ứng dụng hoặc các luồng khác tiêu quota. Cần cảnh báo trước ngưỡng, không tự mua thêm gói và không tự xóa video đang dùng để lấy chỗ.

Giá niêm yết tham khảo ngày khảo sát: lưu trữ $5/tháng cho mỗi 1.000 phút capacity, phân phối $1/1.000 phút; không phải báo giá tổng hoặc số tiền đã được Cha đồng ý chi. MP4 download cũng tính delivery. Giữ nguồn R2/backup còn phát sinh phần lưu R2 tương ứng.

## 8. Quyền truy cập, cleanup và tương thích

- Job chỉ được tạo từ attachment/source session của đúng chủ sở hữu. Không nhận URL tùy ý từ client; chỉ nhận key thuộc prefix/bucket được phép và xác minh server-side. Không để token trong URL/log/UI.
- Bảng mới có GRANT, RLS và policy đọc trạng thái của chủ bài theo quy tắc repo; client không được tự cập nhật trạng thái ready, Stream UID hay cleanup. Backend dùng service role theo handler đã kiểm tra quyền.
- Webhook phân tuyến job bài viết trước, sau đó giữ nguyên xử lý live; đối chiếu UID/job với API, verify chữ ký/timestamp, xử lý lặp idempotent. Không đăng ký đè webhook account hiện tại.
- Hai công cụ dọn Stream phải đọc thêm UID job và post_attachments, giữ cả job đang import/encoding và video ready được tham chiếu; lỗi đọc bảng bảo vệ thì dừng xóa. Metadata loại `post_video` giúp nhận diện, nhưng không thay kiểm tra DB.
- Cleanup R2 giữ nguồn/backup đang được job tham chiếu; xóa bài viết phải hủy job, ngăn webhook hồi sinh dữ liệu và đưa VOD thuộc bài vào quy trình dọn riêng sau khi kiểm tra mọi tham chiếu.
- Bảo toàn privacy của bài viết. Với bài không public, không phát manifest công khai như một giải pháp mặc định; cần signed playback/token backend theo quyền xem bài. Nguồn R2 hiện đã public không được coi là lý do mở rộng công khai thêm.
- Không sửa file types/client Supabase tự sinh. Schema mới qua migration mới; cập nhật kiểu cục bộ nơi cần, phối hợp quy trình duyệt migration của dự án trước production.

## 9. Phạm vi triển khai, kiểm chứng và khôi phục

- V1 áp dụng cho video bài viết mới sau feature flag, chạy canary với tệp mẫu. Không quét/chuyển mã video cũ mặc định; thử đúng MOV 3,40 GB hiện có là một canary có xác nhận riêng trước khi nhập sang Stream.
- Cần xác minh runtime/schema/cron, quota thực tế và quyền API trước enable. Chỉ giữ code cấu hình chưa hoạt động không được báo là tính năng hoàn thành.
- Test: tạo job bền vững/idempotent, ownership, quota/reservation race, import ambiguous timeout, webhook giả/lặp/trễ, cron khôi phục, manifest fail, retry/failed giữ nguồn, nhiều attachment, signed playback/private post, đồng bộ URL và cleanup không đụng RTMP.
- Thử thật trên Preview: upload → đóng tab → server vẫn xử lý → phát được trên desktop/mobile → tải MP4 đúng; so sánh bytes và thời lượng/âm thanh/hình ảnh với nguồn, đo thời gian xử lý. Không dùng số liệu giả lập làm tỷ lệ tiết kiệm thực tế.
- Canary deletion dry-run và thử phục hồi backup trước khi bật dọn. Không chạy mua thêm gói, xoá nguồn hoặc xử lý hàng loạt trong bước thiết kế.
- Feature flag off dừng admission/import/cleanup; job đang chạy được đối chiếu, nguồn cũ giữ phát được. Rollback code bằng PR revert, tắt cron/job action mới có kiểm soát; không drop bảng job đang có dữ liệu. Có snapshot cấu hình/source và metadata trước sửa production.

## 10. Quyết định cần Cha duyệt

Duyệt toàn bộ thiết kế, đặc biệt: R2 làm vùng tiếp nhận → Stream phát lâu dài; dự trữ quota RTMP 240 phút; đề xuất giữ gốc 7 ngày và backup MP4 tối ưu 30 ngày, với dọn thật tách khỏi canary/dry-run. Không có chấp thuận chi tiêu hoặc xóa dữ liệu hiện tại được suy ra chỉ từ lựa chọn Cloudflare Stream.

## Nguồn chính thức

- https://developers.cloudflare.com/stream/ — chuyển mã/phát thích ứng tối đa1080p.
- https://developers.cloudflare.com/stream/uploading-videos/upload-via-link/ — Stream lấy nguồn R2 qua URL.
- https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/ — ready/100%, HMAC, một subscription/account.
- https://developers.cloudflare.com/stream/viewing-videos/download-videos/ — MP4 export và trạng thái ready.
- https://developers.cloudflare.com/stream/faq/ — mặc định max30GB, không tải lại exact input.
- https://developers.cloudflare.com/stream/pricing/ — phút lưu/phát, quota, download billing.

## Rà soát khả thi

Builder-check độc lập: không còn câu hỏi quan trọng ngoài các đề xuất cần Cha duyệt. Đây là đánh giá thiết kế, không phải xác nhận production đã có tính năng.
