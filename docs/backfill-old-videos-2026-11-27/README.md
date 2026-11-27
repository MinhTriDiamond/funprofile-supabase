# Rà soát tuần tự video cũ — 27/11/2026

Cha duyệt xử lý feed/webcam cũ, bỏ RTMP, xác nhận Telegram. Inventory production chỉ đọc:9.362bài/9.395mục nguồn. Loại724RTMP, bao gồm228bài metadata RTMP mâu thuẫn mode webcam;4private,2live giữ nguyên;26mục đã xử lý;350nguồn Stream và772webcam có lineage Stream/R2 không mã hóa lại. Phân loại xem inventory-summary.json. Snapshot đầy đủ/URL/key chỉ ở `.local-backups/backfill-old-videos-2026-11-27`, không commit dữ liệu người dùng.

## Cách chạy

- Inventory cố định được chuyển bằng `bun run scripts/ops/prepare-old-video-backfill.ts .local-backups/backfill-old-videos-2026-11-27` thành seed.sql và seed-chunks/*.sql (không tự apply). Nạp tuần tự các gói200entry khi OFF để tránh giới hạn request API; ON CONFLICT hỗ trợ tiếp tục sau gián đoạn. Loại RTMP theo cả session/metadata và khóa nguồn trùng RTMP trên bài khác. Chỉ webcam canonical `replays/<owner>/<session>/replay.mp4` được nhận; hai nguồn webcam mơ hồ giữ để đối chiếu.
- Migration tạo queue/control service-only, RLS không có policy cho authenticated; mặc định OFF. Cron hiện hữu gọi admission ở tick không chỉ định jobId, chỉ khi không có job hoạt động/VOD chưa dọn/import mơ hồ. Lease/fence và advisory lock chặn nhận hai nguồn đồng thời. Video mới có ưu tiên; không tăng quota hoặc đổi dự phòng240phút cho live.
- Mỗi lượt HEAD có xác thực R2 đúng bucketfun-rich-media; đọc tối đa4MiB đầu+4MiB cuối bằng Range/If-Match để xét MP4. Parser chỉ đọc metadata ISO-BMFF có bound/depth/box count. Webcam không đọc chắc metadata→held, không mã hóa lại mù.404→ghi nguồn mất;403/lỗi mạng→held, không coi là đã mất và không sửa bài.
- Webcam H264/AAC≤1,2Mbps, kích thước≤1920px được giữ nguyên là `already_compressed`; đây là quyết định tránh mã hóa mất chất lượng, không phải tuyên bố đã tạo tệp tối ưu mới. Nguồn khác được đưa vào pipeline Stream→R2private hiện hữu, chỉ publish nếu nhỏ hơn, qua HEAD/Range/ftyp và quyềnpublic/sourceCAS.
- Admission kiểm lại post owner/quyền/nội dung nguồn, RTMP, phiên webcam đã kết thúc cùng chủ nguồn. Tạo/fill attachment thiếu sau snapshot; giữ thứ tự. Legacy chỉ được attestation qua service-only queue/canary; không nới API user.
- Với webcam tối ưu, chỉ đổi các URL metadata của **bài feed** còn bằng nguồn cũ để resolver dùng gateway đã xác minh. Giữ live_sessions/live_replays và các tham chiếu khác; nếu còn dùng nguồn, policy24h sẽ giữ nguyên nguồn. Không hứa xóa mọi nguồn webcam sau24h khi vẫn có tham chiếu.
- Queue lưu jobId/probe/snapshot/reason/checkpoint. Job xong/outcome được theo dõi bằng JOIN; trạng tháiqueued không đồng nghĩa đã hoàn tất. Không khẳng định toàn bộ hàng nghìn video đã xử lý.

## Video đầu tiên

Nguồn feed có owner-scoped key, post1569e229-0814-4fa9-a642-43c7082800ea; snapshot trước admission, không RTMP/live, không job trùng. Job712e31ba-cca8-4d93-8cc1-24060b2a22d0:37.481.012→33.567.165byte, tiết kiệm3.913.847byte. Publish15:42:50 và dọn VOD15:42:59 ngày27/11giờKualaLumpur. HEAD200/Range206/ftyp và permit/cookie đúng; Chrome trên bài thật phát1280x720, readyState4 và thời gian tiến. Nguồn chưa xóa, giữ24h. Receipt:first-output-proof.json.

## Kiểm chứng và phát hành

SQL thật trên PostgreSQL dùng một lần:16guard (OFF, ACL/RLS, lease, active job/VOD, duplicate, privacy, RTMP cả trước admission/lúc publish, webcam attestation, publication/snapshot/giữ tham chiếu). Hai kết nối song song chỉ1claim; authenticated thấy0row. Unit parser/worker/identity sources; offline suite/typecheck/Deno/build ghi receipt khi rollout. Self-review của tác giả, không review độc lập.

Migration trước consumer; snapshot function/DB flags trước deploy; seed khi OFF. Preview đúng commit trước merge. Kiểm smoke feed+webcam+RTMP rồi mới bật queue. Không có thay đổi Worker/cron secret/domain hoặc quyền đọc video.

## Theo dõi / dừng / khôi phục

Tắt `post_video_backfill_control.enabled=false` dừng admission mới; job đã nhận vẫn hoàn tất với các guard hiện hữu. Không xóa schema/queue/snapshots hay reset job nhập mơ hồ. Revert consumer bằng PR hoặc bundle trước deploy; giữ migration để không mất receipt. Bản đã publish có snapshot trước đổi nguồn và nguồn giữ24h; nếu cần phục hồi phải đối chiếu đúng generation/quyền/tham chiếu, không batch restore. Nguồn đã xóa không khôi phục chất lượng gốc từ metadata.

Query theo dõi: `SELECT q.status,q.reason,j.phase,j.outcome,count(*) FROM public.post_video_backfill_items q LEFT JOIN public.post_video_processing_jobs j ON j.id=q.job_id GROUP BY 1,2,3,4;`. Nguồn404/đổi riêng tư/không rõ provenance giữ bài hiện có và đểheld/skipped, không tự xóa.

## Rollout đã thực hiện

PR #100 merged7163400; Preview714ae3a tại https://482c90d4.funprofile-supabase.pages.dev đạt. Migration/history/RLS/service-only được xác minh khi OFF; consumer đã deploy và3file source tải lại khớp hash. Smoke webcam thật→already_compressed, original_current=true, job_idNULL. Sau đó seed38gói200entry (request monolith đầu413 không chạySQL); kiểm đủ7.515entry và0RTMP/mode/config/liveinput. Bật16:09:04 ngày27/11/2026 giờKualaLumpur. Cron cũ nhận video feed4.015.205byte, chỉ1jobbackfillactive trong lần quan sát. Đã hoàn tất thiết lập/chạy tuần tự, **chưa hoàn tất toàn bộ video**; trạng thái có timestamp trong rollout-receipt.json. Không thay cron/secrets.

751testoffline đạt/53skip/111file;16guardSQL/race2connection/RLS,tsgo/Deno/buildđạt. DBthửnghiệm đã dừng. Hàngđợi tiếp tục trênserver,không phụthuộctabChrome/laptop. Các bản Stream sẵn có được ghi nhận không mãhóalại; không tuyên bố đã kiểmphát vật lý từngnguồn ngoàiqueue.
