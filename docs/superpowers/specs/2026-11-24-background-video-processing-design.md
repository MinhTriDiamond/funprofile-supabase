# Thiết kế: xử lý video bài viết nền bằng Cloudflare Stream

Trạng thái: **Cha đã chốt hướng “Stream xử lý tạm → R2 lưu lâu dài → dọn Stream”**. Bản này cập nhật đúng hướng đó; chưa viết code sản phẩm hoặc triển khai.
Người phụ trách: Quang Vũ cùng Angel Muse. Nhánh: `feat/quangvu-background-video-processing`.

## 1. Yêu cầu và lựa chọn đã chốt

Cha muốn video tải lên được xử lý nền để nhẹ hơn, phát ổn định theo tốc độ mạng và giảm dung lượng bản gốc đang lưu. Cha đã chọn **Cloudflare Stream** thay vì máy chuyển mã riêng, rồi xác nhận Stream chỉ xử lý tạm; bản tối ưu phải đưa về R2 để phát feed và giải phóng quota Stream. Bước thông báo Telegram đã được Cha xác nhận.

Mức upload ứng dụng giữ 10 GiB/video, tối đa 4 giờ, không đổi số lượng media. Đây là trần ứng dụng; không đồng nghĩa đã thử tải thật tệp 10 GiB qua Stream. V1 xử lý video bài viết thường; không thay quy trình RTMP/replay đang chạy.

Hướng lưu bản tối ưu R2 và dọn Stream sau xác minh đã được Cha xác nhận. Chính sách xóa tệp gốc R2 vẫn chưa được chốt: mặc định tắt dọn tệp gốc. Mốc giữ gốc 7 ngày/backup 30 ngày trong bản trước không tự áp dụng vào hướng mới.

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
3. **Stream lấy tệp R2 sau upload — bé đề xuất:** tái sử dụng multipart đang hoạt động; người dùng không phải upload lần hai, có nguồn để thử lại. Stream là nơi chuyển mã tạm; bản MP4 đã tối ưu được chuyển về R2, sau đó mới dọn Stream đã đối chiếu đúng job. Có thêm thời gian Stream lấy và chuyển mã.

Stream tự tạo mức chất lượng theo nguồn, tối đa 1080p theo tài liệu hiện hành. V1 không hứa giữ 4K/HDR hay mọi mức 720p/1080p với mọi nguồn. Giảm dung lượng và thời gian mở video phải đo, không hứa một tỷ lệ nén cố định.

## 4. Luồng đề xuất

1. Người dùng upload như hiện tại vào R2. Chỉ sau khi bài viết/attachment được lưu thành công mới tạo job, tránh chuyển mã các bản nháp bỏ dở.
2. Job tạo trong cùng giao dịch lưu attachment hoặc qua outbox DB idempotent. Không dựa vào tab trình duyệt để duy trì việc xử lý.
3. Bộ điều phối server kiểm tra quyền sở hữu nguồn, kích thước thật, trạng thái bài viết và quota. Gửi URL đọc tệp R2 cho Stream `/stream/copy`; file không đi xuyên RAM Edge Function.
4. UI hiển thị “Đang xử lý video”; bài viết vẫn hiện, thumbnail hiện tại giữ nguyên. Bản gốc có thể phát tạm nếu nguồn/trình duyệt hỗ trợ; nếu không thì giữ placeholder, không tạo trạng thái trống.
5. Webhook có HMAC cập nhật job. Cron định kỳ đối chiếu API để xử lý webhook trễ/mất, không poll toàn bộ thư viện mỗi lần xem feed.
6. Chờ API xác nhận đúng UID/account/job, `readyToStream=true`, `status.state=ready` và `pctComplete=100`. Yêu cầu MP4 export; kiểm tra **cả** status download là ready **và** URL đọc được, không chỉ dựa percentComplete thiếu/null.
7. Chuyển MP4 đã tối ưu về key R2 mới bằng multipart có checkpoint/lease. Không tải toàn tệp vào RAM Edge Function, không ghi đè nguồn; mỗi lượt xử lý tối đa một part 16 MiB, tách request qua các lượt cron.
8. Kiểm chứng bản R2: HEAD size khớp chính xác export, GET Range 206/Content-Range đúng, container MP4 hợp lệ, thời lượng/hình-tiếng được kiểm chứng trong canary. Nếu export không nhẹ hơn nguồn thì không đổi feed sang bản lớn hơn; giữ nguồn và ghi kết quả không có lợi về dung lượng.
9. Cập nhật nguyên tử attachment và các trường `posts.video_url/media_urls/metadata` còn được client sử dụng; compare-and-swap chỉ thay đúng nguồn mà job đã xử lý. Feed và tải xuống đều dùng MP4 R2, không có đường phát phụ thuộc Stream sau bước này. R2 MP4 V1 là một chất lượng cố định, không hứa adaptive bitrate; HLS nhiều mức trên R2 ngoài phạm vi V1.
10. Chỉ khi output R2 đã xác minh, publish transaction thành công và không còn tham chiếu Stream cần giữ mới xóa đúng VOD tạm thuộc job (không xóa live input). Xóa lỗi/timeout giữ phase delete_pending, thử lại; 404 được xem là đã dọn. Đối chiếu usage và sự vắng mặt UID sau dọn để xác nhận giải phóng quota.
11. Giữ tệp gốc R2 theo mục6. Xóa nguồn Stream của bài viết không đi qua logic replay RTMP và không xóa UID ngoài job.

## 5. Job và xử lý lỗi

Dự kiến bảng `post_video_processing_jobs`, duy nhất theo attachment + phiên bản nguồn; tách khỏi `live_replays` và `video_upload_sessions`.

Trường cần thiết: owner/post/attachment, nguồn R2 (key, size, hash), Stream account/UID, phase, attempt count, lease expiry, next retry, last safe error, encoded duration/dimensions, export URL/size, output R2 key/size, multipart upload ID/parts, verified/published timestamps, stream delete due/done, source cleanup metadata, cancellation/deletion intent. Trạng thái lỗi xử lý và lỗi dọn nguồn tách biệt.

Các phase: queued → waiting_capacity → importing → encoding → mp4_wait → r2_init → r2_upload → r2_verify → publishing → stream_delete_pending → complete. Các nhánh failed/cancelled/needs_review/not_beneficial tách riêng; not_beneficial vẫn cần dọn Stream sau khi xác minh nguồn R2 còn an toàn. Lease và compare-and-swap chống hai cron cùng làm; unique key chống webhook/retry tạo job trùng. Sau timeout import không gọi copy lại mù quáng: tìm UID theo correlation metadata trước, đưa vào needs_review nếu chưa biết kết quả.

Retry lỗi mạng/429/5xx có backoff và số lần tối đa cấu hình; lỗi định dạng/hỏng nguồn/quá thời lượng không lặp vô hạn. Không đổi URL sang video chưa xác minh. Khi lỗi giữ bản gốc và thông báo/thử lại phù hợp, không dọn nguồn.

## 6. Lưu bản tối ưu và tệp gốc

- **Bản MP4 tối ưu R2 là tài sản chính lâu dài**, gắn vòng đời bài viết. Không có TTL 30 ngày và không bị coi là backup tạm để dọn. Chỉ xóa theo thao tác xóa bài/media có kiểm tra mọi tham chiếu.
- Dọn Stream sau khi MP4 R2 được xác minh và publish thành công là chính sách Cha vừa chọn. R2 output là bản nội dung còn lại để phát và phục hồi feed; giữ provenance, size/hash/metadata và snapshot URL trước chuyển.
- **Tệp gốc R2:** chưa tự xóa trong V1. Giữ key/size/owner riêng và cấu hình cleanup off. Muốn giảm cả tổng lưu trữ R2 cần chốt thời hạn giữ gốc sau; không suy ra chính sách 7 ngày từ lựa chọn kiến trúc.
- MP4 đã tối ưu không khôi phục đúng tệp MOV/4K gốc. Phải nói rõ trước khi bật dọn gốc trong giai đoạn tiếp theo.
- Thử dọn VOD Stream chỉ trong canary được xác nhận; không chạy xóa hàng loạt các video Stream cũ. Các failure ở export/copy/verify/publish đều giữ nguồn và không xóa Stream sớm.

## 7. Quota và chi phí

Dùng account Stream đã cấu hình; không tạo account, mua thêm gói hoặc đổi secrets tự động. Video trong thời gian nhập/chuyển mã/xuất MP4 vẫn tiêu phút lưu Stream. Sau khi xóa VOD tạm thành công, video chỉ còn lưu trên R2 và không tiếp tục chiếm quota lưu Stream. Stream không tính quota lưu theo GB.

Đề xuất để dành **240 phút** cho RTMP, cấu hình được, chỉ nhận job khi dung lượng khả dụng trừ phần dự trữ và reservation của job khác đủ cho thời lượng nguồn. Kiểm tra usage/account thực tế trước bật. Reservation có thời hạn/lease và đối chiếu sau khi Cloudflare báo thời lượng thật; khóa admission theo account tránh nhiều job cùng chiếm một phần quota. Nếu API usage lỗi thì hoãn import, giữ R2, báo “Chờ dung lượng xử lý”.

Thông tin thời lượng từ client không được coi là số liệu tin cậy để cấp quota. Trước khi bật đại trà, phải kiểm chứng cơ chế chặn thời lượng phía Stream cho đường copy: không suy ra request hỗ trợ maxDurationSeconds chỉ vì response có trường này. Trong khi chưa xác minh được hard cap, chỉ chạy canary admin có thời lượng nguồn đã được kiểm tra, reservation bảo thủ 240 phút/job, không mở import tự do cho tài khoản thường. Nếu copy không thể áp hard cap, builder dùng transfer TUS có maxDurationSeconds được Stream áp dụng, đọc từng phần từ R2 bằng backend và lưu offset bền vững; đây vẫn là Stream xử lý nền và không yêu cầu người dùng upload lại. Không giảm phần dự trữ theo duration client chưa xác minh.

Usage đọc từ GET /accounts/{account_id}/stream/storage-usage, trường totalStorageMinutes/totalStorageMinutesLimit; không lọc theo creator khi tính budget account. Khi copy hỗ trợ, ưu tiên tham số input theo API hiện hành thay cho url đã deprecated; cần test thật xác nhận.

Guard của ứng dụng không thể ngăn upload trực tiếp ngoài ứng dụng hoặc các luồng khác tiêu quota. Cần cảnh báo trước ngưỡng, không tự mua thêm gói và không tự xóa video đang dùng để lấy chỗ.

Giá niêm yết tham khảo ngày khảo sát: lưu trữ $5/tháng cho mỗi 1.000 phút capacity, phân phối $1/1.000 phút; không phải báo giá tổng hoặc số tiền đã được Cha đồng ý chi. MP4 download cũng tính delivery. Stream lấy nguồn/xuất MP4 vẫn có thể tính delivery; R2 tính lưu nguồn gốc và bản tối ưu tương ứng. Không hứa quy trình chuyển mã hoàn toàn miễn phí.

## 8. Quyền truy cập, cleanup và tương thích

- Job chỉ được tạo từ attachment/source session của đúng chủ sở hữu. Không nhận URL tùy ý từ client; chỉ nhận key thuộc prefix/bucket được phép và xác minh server-side. Không để token trong URL/log/UI.
- Bảng mới có GRANT, RLS và policy đọc trạng thái của chủ bài theo quy tắc repo; client không được tự cập nhật trạng thái ready, Stream UID hay cleanup. Backend dùng service role theo handler đã kiểm tra quyền.
- Webhook phân tuyến job bài viết trước, sau đó giữ nguyên xử lý live; đối chiếu UID/job với API, verify chữ ký/timestamp, xử lý lặp idempotent. Không đăng ký đè webhook account hiện tại.
- Hai công cụ dọn Stream phải đọc thêm UID job và post_attachments, giữ cả job đang import/encoding và video đang chờ export/copy/publish/dọn có tham chiếu; lỗi đọc bảng bảo vệ thì dừng xóa. Metadata loại `post_video` giúp nhận diện, nhưng không thay kiểm tra DB.
- Cleanup R2 giữ nguồn và output lâu dài đang được job/bài viết tham chiếu; xóa bài viết phải hủy job, ngăn webhook hồi sinh dữ liệu và đưa VOD thuộc bài vào quy trình dọn riêng sau khi kiểm tra mọi tham chiếu.
- Bảo toàn privacy của output mới và hành vi đổi privacy của bài viết. Với bài không public, không tạo output mới ở miền R2 public. Tất cả output tối ưu mới dùng bucket R2 private, không gắn public custom domain. V1 chỉ bắt đầu tối ưu bài public; bài non-public ban đầu được bỏ qua và giữ đường phát hiện tại, không báo đã tối ưu. Nếu bài đã tối ưu sau đó đổi privacy, vẫn phát bản private R2 qua gateway kiểm tra quyền hiện tại, không chặn quyền đổi privacy của chủ bài. Gateway Worker chỉ bind bucket output private, gọi Edge authorization cho mỗi GET/HEAD/Range và stream response; không đưa service_role key sang Worker. Token đọc ngắn5phút gắn viewer/post/attachment/source generation, không lưu vào metadata; frontend gia hạn và giữ vị trí khi hết hạn. Cơ chế authorize phải theo privacy/friendship/block hiện tại, cả phát và download; không chỉ kiểm tra token đã từng hợp lệ. Token/headers không log. V1 không hứa thu hồi những byte người xem đã tải hoặc URL gốc đã public trong luồng cũ. Nguồn R2 hiện đã public không được coi là lý do mở rộng công khai thêm.
- Không sửa file types/client Supabase tự sinh. Schema mới qua migration mới; cập nhật kiểu cục bộ nơi cần, phối hợp quy trình duyệt migration của dự án trước production.

## 9. Phạm vi triển khai, kiểm chứng và khôi phục

- V1 áp dụng cho video bài viết public mới sau feature flag, chạy canary với tệp mẫu. Không quét/chuyển mã video cũ mặc định; thử đúng MOV 3,40 GB hiện có là một canary có xác nhận riêng trước khi nhập sang Stream.
- Cần xác minh runtime/schema/cron, quota thực tế và quyền API trước enable. Chỉ giữ code cấu hình chưa hoạt động không được báo là tính năng hoàn thành.
- Test: tạo job bền vững/idempotent, ownership, quota/reservation race, import ambiguous timeout, webhook giả/lặp/trễ, cron khôi phục, manifest fail, retry/failed giữ nguồn, nhiều attachment, non-public bị bỏ qua, kiểm tra privacy đổi trong lúc xử lý, đồng bộ URL và cleanup không đụng RTMP.
- Thử thật trên Preview: upload → đóng tab → server vẫn xử lý → phát được trên desktop/mobile → tải MP4 đúng; so sánh bytes và thời lượng/âm thanh/hình ảnh với nguồn, đo thời gian xử lý. Không dùng số liệu giả lập làm tỷ lệ tiết kiệm thực tế.
- Canary deletion dry-run và thử khôi phục phát từ MP4 R2 trước khi bật dọn VOD Stream. Không chạy mua thêm gói, xoá nguồn hoặc xử lý hàng loạt trong bước thiết kế.
- Feature flag off dừng admission/import/cleanup; job đang chạy được đối chiếu, nguồn cũ giữ phát được. Rollback code bằng PR revert, tắt cron/job action mới có kiểm soát; không drop bảng job đang có dữ liệu. Có snapshot cấu hình/source và metadata trước sửa production.

## 10. Hướng đã được Cha xác nhận và ranh giới còn lại

Đã xác nhận: **Stream xử lý tạm → MP4 tối ưu R2 phát feed/tải xuống lâu dài → dọn VOD Stream sau xác minh**. Không áp dụng thời hạn 30 ngày lên bản tối ưu. Không tự xóa tệp gốc R2, không mua thêm gói, không xử lý hàng loạt video cũ. Dự trữ RTMP mặc định240phút là cấu hình bảo thủ của bé, cần kiểm tra quota thật trước bật.

Thiết kế đã đổi từ bản phát lâu dài trên Stream; các phần review của bản cũ không thay cho kiểm chứng pipeline mới. Kế hoạch triển khai phải kiểm tra đặc biệt export-ready, copy resumable, publish nguyên tử và thứ tự dọn.

## Nguồn chính thức

- https://developers.cloudflare.com/stream/ — chuyển mã/phát thích ứng tối đa1080p.
- https://developers.cloudflare.com/stream/uploading-videos/upload-via-link/ — Stream lấy nguồn R2 qua URL.
- https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/ — ready/100%, HMAC, một subscription/account.
- https://developers.cloudflare.com/stream/viewing-videos/download-videos/ — MP4 export và trạng thái ready.
- https://developers.cloudflare.com/stream/faq/ — mặc định max30GB, không tải lại exact input.
- https://developers.cloudflare.com/stream/pricing/ — phút lưu/phát, quota, download billing.

## Rà soát khả thi

Builder-check bản R2 lâu dài phát hiện trường hợp đổi privacy sau publish. Đã chốt quyết định kỹ thuật: output luôn ở bucket private, gateway kiểm tra quyền hiện tại trên mọi lần đọc, không khóa tính năng đổi privacy. Đây là tài liệu thiết kế, không phải xác nhận production đã có tính năng.
