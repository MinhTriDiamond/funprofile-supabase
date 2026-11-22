# Dọn toàn bộ Cloudflare Stream — 2026-11-21

## Kết quả cuối cùng — 2026-11-22

**Cloudflare Stream đã về 0/1.000 phút lưu trữ, trống đủ 1.000 phút**, xác minh bằng dashboard tải lại toàn trang sau lần xóa cuối. Còn 494 mục lỗi/không phát được nhưng không chiếm phút lưu trữ; giữ nguyên các mục này và live input.

Đã dọn 35 VOD theo xác nhận của Cha: batch 34 nguồn ban đầu và 1 recording phát sinh mới dài 100,77 phút. Trước khi xóa, đã lưu 35 MP4 (~6,05 GB) trên local và R2, thử ghép phục hồi toàn bộ và GET đối chiếu đủ 53/53 file R2 theo SHA-256/dung lượng. 34 nguồn cũ đã kiểm chứng HTTP404; nguồn bổ sung HTTP404; bản R2 mà bài feed liên quan đang phát vẫn HTTP200, đủ 639.076.510 byte. Không thay DB/feed/stream key/cron/secrets trong đợt dọn này.

Bằng chứng: `final-quota.json`, `deleted-source-verification.json`, `final-media-verification.json`, `r2-remote-verification.json` (47 file), `new-recording-r2-verification.json` (6 file). Kiểm chứng giải mã: 2 bản full-decode, 33 bản kiểm tra mẫu đầu/giữa/cuối, cộng kiểm tra cấu trúc tất cả đoạn, thời lượng và hash/size; không tuyên bố full-decode cả 35.

Backup public (gói phục hồi, không phải URL phát trực tiếp cho feed):
- https://media.fun.rich/stream-full-backups-2026-11-21/manifest.json
- https://media.fun.rich/stream-new-backup-2026-11-22/manifest.json

PR hồ sơ: https://github.com/MinhTriDiamond/funprofile-supabase/pull/67 . Nội dung dưới đây là nhật ký theo từng checkpoint; các trạng thái chờ xác nhận ở checkpoint cũ đã được giải quyết theo kết quả cuối cùng này.

Đã có xác nhận Telegram và yêu cầu của Cha giải phóng toàn bộ quota. Nhánh `fix/quangvu-stream-full-cleanup`.

Thứ tự: kiểm kê → đối chiếu DB/feed → sao lưu đầy đủ → kiểm chứng → chuyển tham chiếu nếu cần → xóa nguồn đã xác minh → đo lại quota. Giữ nguyên live input.

Trạng thái: bắt đầu kiểm kê; chưa xóa dữ liệu.

## Kết quả kiểm kê

- Dashboard tải mới: 529 video, 722/1.000 phút. Đã đọc đủ 529 UID duy nhất qua toàn bộ trang dashboard, lưu `stream-inventory.json`.
- Manifest công khai: 35 UID HTTP200 với tổng 43.310,4077 giây (~721,84 phút); 451 HTTP404; 43 HTTP424. HTTP404/424 không tự chứng minh video có thể xóa; giữ nguyên các mục này trong đợt giải phóng phút.
- Snapshot DB trước thao tác lưu trong thư mục local bị ignore `.local-backups/stream-full-cleanup-2026-11-21/`; không commit dữ liệu/nội dung người dùng. 5 UID được bài feed tham chiếu; 344 UID có tham chiếu DB bất kỳ. Thống kê theo UID ở `reference-counts.json`.
- Một UID `34568217e9636bfd3e9ab924821e9c14` đang được cả dashboard và DB đánh dấu LIVE (session `54d8c6f7-7657-494d-a2b9-66cc9bfcf358`, started_at `2026-11-20T21:29:26.829Z`). Không xóa hay kết thúc phiên này khi chưa rõ trạng thái. Đã hỏi Cha, tiếp tục sao lưu các VOD còn lại.
- UID `9ed496abe78123422b6eda9abceae93f` chỉ còn hls_url cũ trong metadata; video_url/playback_url/r2_video_url của post đang trỏ R2 khác UID. Cần kiểm chứng R2 trước khi xóa nguồn cũ.
- Dry-run `stream-orphan-cleanup` qua cấu hình cron hiện có trả HTTP401; không thay đổi auth để vượt lỗi. Chưa xóa nguồn nào.

## Bản sao đã chuẩn bị, chưa upload / chưa xóa

- Đã lưu đủ 34 VOD (không gồm UID LIVE), 5.130.690.432 byte. Nguồn được tải theo variant băng thông cao nhất, đủ track hình/tiếng nếu có; từng đoạn MP4 được kiểm tra cấu trúc trước ghép, ffprobe đối chiếu thời lượng.
- 34/34 file có SHA-256 và dung lượng khớp manifest; kiểm chứng giải mã gồm 2 bản full-decode và 32 bản lấy mẫu 5 giây tại đầu/giữa/cuối. Không tuyên bố cả 34 đã full-decode. Chi tiết ở `backup-verification.json`.
- Đã chia 45 phần video <=290.000.000 byte, thêm manifest và script = 47 file. Thử ghép lại toàn bộ 34 MP4 trên local thành công, đủ dung lượng và SHA-256 toàn file. Manifest ở `backup-parts-manifest.json`, script ở `restore_backups.py`.
- Đích dự kiến: bucket `fun-rich-media`, account `6083e34ad429331916b93ba8a5ede81d`, prefix `stream-full-backups-2026-11-21/`; bucket public qua `https://media.fun.rich/`. Đây là gói phục hồi, không phải URL phát trực tiếp cho feed.
- 47 file đã được chọn trong native file chooser, nhưng auto-review từ chối thao tác Open/upload: xác nhận trước của Cha chỉ áp dụng 12 file/2,77 GB, chưa bao gồm payload mới 47 file/5,13 GB. Không thử đường vòng; đang chờ xác nhận cụ thể mới. Chưa có remote read-back cho gói này.
- Không xóa video Stream trong đợt này; chưa thay DB/feed; quota chưa được giải phóng thêm. Không thay đổi Edge Function, cron, secrets hoặc live input.

## Phục hồi và giới hạn

Tải đủ các file trong manifest về cùng thư mục với script, chạy `python3 restore_backups.py <thu-muc-dich-moi>`. Script từ chối ghi đè, kiểm tra hash/size từng phần và MP4 ghép lại. Nếu sau này xóa Stream thì không thể khôi phục UID cũ trong sản phẩm; có thể upload lại MP4 để tạo UID mới và cập nhật tham chiếu khi cần. Snapshot DB/media trước thao tác được giữ local bị ignore; không có thay đổi DB cần rollback ở checkpoint này.

Một phiên còn LIVE cần được kết thúc hợp lệ trước khi có thể đạt toàn bộ 1.000 phút trống; chưa có xác nhận của Cha về trạng thái OBS. 494 mục trả manifest 404/424 được giữ nguyên vì chưa cần xóa để giải phóng số phút có nội dung.

## Xác nhận upload bổ sung

Cha đã xác nhận trực tiếp trong chat “OK BÉ, CHA XÁC NHẬN” cho gói mới 47 file/5,13 GB vào đúng bucket/prefix public đã nêu. Đã bắt đầu upload qua dashboard; chờ hoàn tất và kiểm chứng remote SHA-256/dung lượng. Xác nhận này áp dụng upload, chưa phải xác nhận tại thời điểm xóa vĩnh viễn nguồn Stream.

## 2026-11-22 · Upload và kiểm chứng hoàn tất, chưa xóa nguồn

- Sau xác nhận gói mới của Cha, đã upload đúng 47 file / 5.130.690.432 byte video vào bucket/prefix đã thông báo. GET đọc lại đủ 47/47 file từ R2, toàn bộ SHA-256/dung lượng khớp (`r2-remote-verification.json`). Một lần GET bị ngắt HTTP/2 đã được thử lại thành công; không chấp nhận kết quả đọc thiếu.
- Kiểm tra mới: HEAD 47/47 file khớp dung lượng, GET manifest có SHA-256 trùng bản local (`r2-predelete-head-verification.json`). Bản sao local và bản ghép thử vẫn giữ nguyên.
- Phiên LIVE được bảo vệ trước đó đã tự chuyển `archived`, có ended_at; R2 HEAD200 và nguồn Stream404. Bằng chứng `previous-live-autoarchive-verification.json`. Không tự kết thúc phiên qua dashboard.
- Kiểm tra lại 34 nguồn: 34 HTTP200, tổng 43.294,2697 giây (~721,5778 phút); bản backup đã xác nhận đủ VOD. Có 5 session tham chiếu, tất cả status ended, 0 replay tham chiếu; 1 post chỉ giữ URL HLS cũ, video_url và playback_url đang dùng R2. Tóm tắt an toàn trong `predelete-reference-summary.json`; snapshot đầy đủ chỉ local.
- Chưa xóa nguồn trong đợt này. Cần xác nhận tại thời điểm thao tác vì Cloudflare cảnh báo Delete Video là vĩnh viễn, không thể undo và UID cũ không phục hồi được dù có thể upload lại MP4. Danh sách cụ thể 34 UID ở `cleanup-plan.json`. Không xóa 494 mục lỗi không phát được trong đợt giải phóng phút này.
- Chưa tuyên bố đạt 1.000 phút trống; cần đo lại dashboard sau khi xóa được xác nhận. PR #67 vẫn nháp, chờ hoàn tất bước production trước khi merge hồ sơ.

Manifest backup public: https://media.fun.rich/stream-full-backups-2026-11-21/manifest.json . Các phần video là gói phục hồi, không phải URL phát trực tiếp cho feed.

## 2026-11-22 · Xác nhận xóa tại thời điểm thao tác

Cha trả lời “cha xác nhận” ngay sau câu hỏi xóa vĩnh viễn đúng 34 nguồn trong cleanup-plan.json. Bắt đầu dọn batch 34 UID đã backup, không xóa live input hay 494 mục lỗi ngoài danh sách.

## 2026-11-22 · Batch 34 nguồn đã xóa; phát sinh bản ghi mới

Sau xác nhận tại thời điểm xóa của Cha, đã xóa đúng 34 UID trong cleanup-plan qua dashboard, kiểm tra UID + Ready trước mỗi nguồn và nhập đúng tên để xác nhận. Không xóa live input hoặc 494 mục lỗi. Dashboard sau batch còn khoảng 101/1.000 phút và 496 mục (cần đo mới sau cập nhật), thay vì 0 phút vì có bản ghi mới `ebbf09e0267c6f06aaf53f374fbd799d`, tiêu đề 21 Nov 26 13:57 UTC, ngoài snapshot ban đầu. Dashboard nguồn mới là Ready; truy vấn session theo UID không có kết quả. Tiếp tục đối chiếu và sao lưu nguồn mới trong phạm vi yêu cầu giải phóng toàn bộ quota, chưa xóa nó.

Kiểm chứng sau batch: toàn bộ 34 UID HTTP404 (`deleted-source-verification.json`); URL R2 mà feed đang dùng vẫn HEAD200 sau xóa. UID phát sinh mới có 0 session/replay/post/comment/profile tham chiếu, là VOD Ready dài 6.046,101 giây. Giữ nguyên nguồn mới trong lúc backup.

## Bản ghi phát sinh mới đã backup local, chờ xử lý bổ sung

- UID `ebbf09e0267c6f06aaf53f374fbd799d`, Ready, tiêu đề 21 Nov 26 13:57 UTC; thời lượng 6.046,099044 giây. Không có tham chiếu trong 5 nhóm session/replay/post/comment/profile.
- Đã tải đủ 6.010 đoạn hình/tiếng, ghép MP4 921.465.831 byte, SHA-256 `f272c55c1d725ea08ab6a7e684318c82c5cc6de1262b1b26afc183927929ee9a`. Kiểm chứng cấu trúc từng đoạn, thời lượng, SHA-256 và giải mã mẫu đầu/giữa/cuối đạt; thử ghép phục hồi khớp toàn file.
- Gói bổ sung: 4 phần video <=290 MB + manifest + script = 6 file; đích dự kiến bucket public `fun-rich-media`, prefix `stream-new-backup-2026-11-22/`, base `https://media.fun.rich/stream-new-backup-2026-11-22/`. Chưa upload gói mới và chưa xóa UID mới; xác nhận trước chỉ cho batch 34 nguồn/gói 47 file.
- Cần xác nhận cụ thể cho phần phát sinh mới: upload gói 6 file (~921 MB), kiểm chứng remote SHA-256/dung lượng, rồi xóa vĩnh viễn đúng UID này sau khi bản R2 đạt kiểm chứng. Nếu kiểm chứng lỗi hoặc nguồn không còn Ready thì giữ nguồn. Không xóa input hay mục lỗi ngoài danh sách.

Cha đã trả lời “ok cha” cho batch bổ sung cụ thể: upload 6 file (~921 MB) vào prefix public stream-new-backup-2026-11-22/, kiểm chứng remote rồi xóa UID ebbf09e0267c6f06aaf53f374fbd799d. Điều kiện giữ nguyên: chỉ xóa sau remote hash/size đạt và nguồn vẫn Ready. Đang phối hợp phiên Chrome do công cụ liên tục báo cửa sổ thay đổi; chưa upload hay xóa UID bổ sung tại checkpoint này.

## Hoàn tất batch bổ sung

Cha xác nhận gói 6 file và thao tác xóa có điều kiện. Upload bằng Wrangler CLI sử dụng phiên OAuth hiện có, đúng account R2; không đăng nhập lại hay mở rộng quyền. GET kiểm chứng 6/6 file hash/size khớp rồi mới xóa UID ebbf09e0267c6f06aaf53f374fbd799d bằng dashboard, guard đúng UID + Ready và nhập đúng tên xác nhận. Sau xóa tải lại toàn trang thấy 494 mục, 0/1.000 phút, 0%; xác minh nguồn HTTP404 và video R2 của feed HTTP200.

## Tin Telegram hoàn tất để Cha copy

> Quang Vũ · Đã hoàn tất dọn quota Cloudflare Stream: dashboard tải mới về 0/1.000 phút, trống đủ 1.000 phút để dành cho live RTMP. Đã sao lưu 35 VOD (~6,05 GB), gồm 34 nguồn cũ và 1 bản ghi mới 100,77 phút, rồi mới xóa đúng nguồn được xác nhận. GET kiểm chứng 53/53 file backup R2 khớp SHA-256/dung lượng; đã thử ghép phục hồi MP4 trên local. Các nguồn đã dọn trả 404; video feed liên quan vẫn phát từ R2 (HTTP200). Giữ nguyên live input, stream key và 494 mục lỗi không chiếm phút; không đổi DB/feed/cron/secrets. Việc này giải phóng toàn bộ quota lưu trữ hiện tại và giữ bản sao phục hồi. Hồ sơ/PR: https://github.com/MinhTriDiamond/funprofile-supabase/pull/67 .
