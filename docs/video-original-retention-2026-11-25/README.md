# Giữ nguồn video 24 giờ sau khi tối ưu

Trạng thái: đang kiểm thử/phát hành, cờ dọn nguồn mặc định OFF. Cha đã duyệt chính sách và xác nhận thông báo Telegram. Nhánh `feat/quangvu-video-original-retention-24h`.

Thời hạn tính từ `published_at` của bản tối ưu, theo database. Chỉ job hoàn tất tối ưu, đã dọn VOD Stream, có bản MP4 private đã xác minh và vẫn gắn vào bài hiện hành mới được dọn nguồn. Trước mỗi lần xóa phải kiểm tra lại HEAD/Range/MP4 output, ETag/kích thước/owner nguồn và mọi tham chiếu sống. Job lỗi, chưa publish, không có lợi ích hoặc còn tham chiếu giữ nguồn. Có tối đa năm lần thử, cách sáu giờ khi bị chặn; sau đó giữ để đối soát.

Migration `20261125060000_post_video_original_retention.sql` thêm cờ `original_delete_enabled=false`, lease và receipt service-only. Claim/arm/finish đều có fence; arm kiểm đủ 24 giờ và ghi receipt trước xóa. Trigger tham chiếu dùng shared advisory lock theo đúng source key; arm dùng exclusive cùng key rồi kiểm tra lại. Tham chiếu mới bị chặn sau intent, kể cả khi tiến trình crash. Không giữ khóa database trong lúc gọi R2. Các upload session của nguồn được chuyển aborted khi arm; API upload vốn khóa source key theo job và URL ký chỉ 15 phút.

Nguồn không bị xóa bởi R2 lifecycle theo prefix; chỉ exact key của job đủ điều kiện. MP4 tối ưu ở bucket `fun-rich-video-optimized` không bao giờ là đích DELETE của cơ chế này. Sources write-frozen trong ứng dụng, HEAD/ETag kiểm lại trước DELETE. [Cloudflare không liệt kê conditional DELETE trong các thao tác conditional write](https://developers.cloudflare.com/r2/api/s3/conditional-operations/); không quảng cáo If-Match DELETE nguyên tử. Thao tác ghi ngoài ứng dụng bằng credential quản trị cần phối hợp vận hành. Nguồn cached trên CDN có thể còn tồn tại sau khi origin R2 đã xóa; receipt chỉ xác nhận storage origin404.

Tick cron hiện có chạy thêm tối đa một bước dọn nguồn mỗi tick, không phụ thuộc trình duyệt. Xóa xong phải HEAD404 trước ghi `source_deleted_at`; mất phản hồi DELETE sẽ được đối soát theo intent và404, vẫn kiểm lại output/ref. Không xóa lại Stream hay sửa nội dung bài trong bước này. Audit `originalRetained` phản ánh trạng thái nguồn thật.

## Kiểm chứng và cổng phát hành

- Unit: trước24h, lỗi output/nguồn, arm bị chặn,404/recovery, đúng bucket/key/ETag và foreign source; probe chỉ một tệp giả1024bytes với tên ngẫu nhiên.
- SQL fixture local dùng database một lần: flagOFF,23h/25h, outcome/cancel, lease/fence, ETag, nested metadata reference, tombstone chặn relink, receipt, ACL. Hai kết nối thật chứng minh reference đang ghi phải commit và chặn retirement.
- Offline suite, tsgo, Deno check, application build; self-review theo checklist noearlydelete/ref race/owner/output preservation. Đây là self-review của tác giả; không ghi là review độc lập bởi người khác.
- PR/Preview đúng head trước merge; snapshot processor/webhook và metadata đúng canary trước migration; migration trước consumer. Giữ cờ OFF đến khi source-dry-run trả đúng dueAt, nguồn/output còn tốt và probe tệp giả xóa/404 đạt.
- Không ép video3,40GB xóa sớm để thử. Khi bật cờ, báo rõ đã lập lịch nếu chưa tới hạn; việc xóa thật chỉ ghi receipt sau404.

## Khôi phục và đối soát

Tắt `original_delete_enabled` để ngừng admission dọn nguồn mới; một bước đã arm có thể đang chạy. Giữ các cột/tombstone/receipt, không drop khi còn worker sử dụng, không phục hồi bằng cách mở lại key đã nghỉ. Revert consumer qua PR hoặc bundle trước triển khai; giữ RPC/guard để không tạo tham chiếu hỏng. Bản nguồn đã xóa không thể phục hồi chất lượng gốc từ metadata backup; MP4 tối ưu là bản lưu lâu dài. Metadata recovery backup chỉ chứa mục tiêu canary, key/size/ETag và locator, mode600 ngoài Git; không chứa token/TUS URL. Không copy thêm toàn bộ nguồn3,40GB để tránh vô hiệu mục tiêu tiết kiệm dung lượng đã được Cha duyệt.

Đo truy vấn read-only trên production: bản chuyển đổi row JSON hai lần37,24s, bản `LIKE ANY` escaped chỉ chuyển đổi một lần32,33s. Timeout riêng source RPC/arm55s, HTTP65s; giới hạn này không sửa RPC Stream cũ hoặc timeout role/global. Tác vụ chưa tới hạn không chạy truy vấn quét.
