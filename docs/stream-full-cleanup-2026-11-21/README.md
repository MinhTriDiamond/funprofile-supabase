# Dọn toàn bộ Cloudflare Stream — 2026-11-21

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
