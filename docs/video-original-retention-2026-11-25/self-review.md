# Tự kiểm tra trước phát hành

Đã kiểm tra diff riêng của chính sách24h, không xem việc triển khai cũ là bằng chứng cho phần mới.

- SQL là nguồn quyết định thời hạn: `published_at <= clock_timestamp()-24h` tại claim và arm. Job complete/outcomeoptimized/khôngcancelled, outputverified và Streamdeleted bắt buộc; cờ riêng mặc địnhOFF.
- Không cấp authenticated SELECT cho cột runtime/receipt mới. RPC chỉ service_role, guard SECURITYDEFINER không nhận SQL; biến bảng cố định, formatidentifier%I, key/URL truyền parameter.
- Guard theo sourcekey bắt thamchiếumới và giữtombstone; hai transaction thật kiểm INSERTcomment lấysharedlock và armexclusive kiểm saucommit. Triggers hoạt động trên toànrowJSON để không bỏ metadata/nội dung lồng nhau. Phần kiểm thamchiếu source tạiDB không trảpayload.
- Lease/fence kiểm trước arm/finish, retry không reupload/tạoStream. Recovery404 cần intent+receipt và kiểm lạioutput/ref. SourceDELETE chỉ key owner/legacyattested đã pinETag; không dùngprefixbatch hoặc bucketoutput.
- Retention không sửa bài/MP4; uploadsessionretired ngăn resume. Guard không bị gỡ khi rollback để không tạo linkhỏng. Secret qua cron có sẵn; endpoint source-dry-run/source-probe vẫn qua auth admin/cron.
- Giới hạn: R2 không có documented conditionalDelete trongwriteAPI; sourcefrozen ởứngdụng và HEAD/ETag trướcdelete, quản trị ngoàiứngdụng phải phối hợp. SourcecachedCDN không đồng nghĩa origin cònlưu. Guard lookup theo sốjobs có thể cần tốiưu khi tăng quy mô; failclosed/timeout giữ nguồn.
- 707offlinepass/53skip,105files; SQLintegration/ACL/racepass; tsgo/Deno/buildpass. Chưa có actualdelete nguồnngườidùng vì chưađủ24h; runtimeprobe nguồn1KiB và source-dry-run là cổng trước bật lịch.
