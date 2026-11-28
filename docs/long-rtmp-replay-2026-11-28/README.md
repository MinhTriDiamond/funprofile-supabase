# Bản ghi RTMP trên bốn giờ — 28/11/2026

Cha đã xác nhận Telegram trước khi bắt đầu. Nhánh `fix/quangvu-long-rtmp-replay`.

## Chẩn đoán

Stream UID `4641dfe88bdfaf390fdca77d5707cb26`; session `1dbef509-286b-499b-b634-526d1c37d4f5`; replay `2dcca8db-db44-49b8-97cc-edf261682786`; post `26c9de27-1a4d-4153-b469-f3927fad277f`.

HLS video720p và audio đều có7284segment, ENDLIST, thời lượng14.554,1giây (4:02:34,1). Replay kẹt `mp4_export`, HTTP400, chưa có r2_object_key. Không phải bằng chứng mất bản ghi.

Cloudflare chỉ hỗ trợ xuất MP4 trực tiếp với bản ghi live không quá giới hạn4giờ; HLS/DASH vẫn còn phát lại: https://developers.cloudflare.com/stream/stream-live/download-stream-live-videos/ . Giới hạn export của provider khác với chính sách thời lượng phiên của ứng dụng. Mã hiện hành cũng đặt RTMP240phút (`src/modules/live/liveDurationPolicy.ts`, bản shared và mặc định grace-watchdog4giờ). Stream recording.mode=automatic bắt đầu từ khi nguồn OBS kết nối, có thể trước lúc bấm live; vì vậy cắt phiên ở240phút không bảo đảm bản ghi Stream dưới4giờ. Bản cụ thể dài14.554,1giây trong khi started_at→ended_at của phiên là14.457,283giây, chênh khoảng96,817giây. Bản sửa này không đổi chính sách thời lượng phiên.

## Bản sửa

- Phân biệt liveInput/duration từ metadata Stream, không áp giới hạn này cho uploaded VOD. Bản ghi live quá4giờ được nhận diện `live_mp4_duration_limit`, giữ HLS/nguồn và hẹn kiểm tra lại24giờ; không đánh dấu nguồn mất hoặc gửi thông báo recording unrecoverable. Poll cron tôn trọng hạn này.
- Phục hồi bản cụ thể bằng tải HLS có checkpoint, remux H.264/AAC thành MP4 không encode lại. Snapshot DB/playlists/raw media giữ ở thư mục local bị ignore `.local-backups/long-rtmp-replay-2026-11-28/`.
- `rtmp-recovery-upload` là công cụ vận hành, mặc định tắt khi không có capability. Chỉ một replay/UID, token bămSHA256 và hạn dùng; xác minh session public/ended/RTMP/owner trước mỗi yêu cầu. Chỉ tải multipart vào key dẫn xuất cố định. Không nhận key tùy ý, không xuất APIkeys, không có quyền publish hoặc xóa Stream. Cấu hình `RTMP_RECOVERY_UPLOAD_CAPABILITY` do operator tạo, không ghi giá trị vào Git/hồ sơ.
- Chỉ sau full-decode, remote size/SHA256 và playback đạt mới gắn bản R2 vào replay để pipeline hiện hữu cập nhật post. Không xóa nguồn trước kiểm chứng publication.

## Giới hạn

Bản sửa không thêm dịch vụ remux nền cho mọi phiên live dài tương lai. Các phiên đó được nhận diện và giữ nguồn HLS, cần chạy công cụ phục hồi hoặc bổ sung hạ tầng remux riêng. Không cắt/ngắt phiên live đang phát để tránh giới hạn export.

## Khôi phục

Trước deployment tải bundle cũ của archive/poll cron. Nếu có regression, redeploy bundle đã snapshot hoặc revert PR qua Preview. Gỡ capability sau phục hồi để khóa endpoint; có thể xóa function mới sau khi không còn upload hoạt động. Giữ bản MP4 phục hồi và snapshot DB. Không tự xóa R2 đang được bài feed tham chiếu; không reset source UID. Sau khi Stream bị dọn, UID cũ không khôi phục được, chỉ có thể nhập lại media với UID mới.

## Kết quả production

- Đã phục hồi đầy đủ bản ghi4:02:34 thành MP4 R2,2.758.959.012byte. Đọc đủ toàn bộ object qua329Range liên tiếp, cố địnhETag, SHA256 khớp bản local đã full-decode; HEAD200/Range206/MP4header và Range cuối đạt.
- Transaction `publication.sql` kiểm lại owner/public/ended/UID/post/lease và nguồn chưa được thay, chỉ gắn replay đã xác minh. Cron hiện hữu tự cập nhật đúng post `26c9de27-1a4d-4153-b469-f3927fad277f`, không tạo bài mới. Post `ready_mp4`, replay `archived/done`, session `archived`, không có lỗi dọn.
- Stream đã dọn28/11/2026 lúc18:12:11,942 giờKualaLumpur; manifest cache-bust404. Không đụng live input/stream key/phiên đang live hay hàng đợi tối ưu video feed/webcam.
- Chrome thật mở bài public, phát từ đúng URL R2 ở1,87giây;7.277,86giây;14.540,87giây,1280×720,không lỗi sau khi nguồn Stream đã xóa. Ảnh kiểm chứng lưu local ignored, JSON ở browser-proof.json.
- Capability tạm đã gỡ sau complete upload, thử quyền cũ401; token local cũng đã dọn. Endpoint không có capability mặc định trả401, không còn quyền upload của tác vụ.

Bằng chứng: rollout-receipt.json, remote-proof.json, range-proof.json, capability-revoked.json, browser-proof.json. Validation757test offline đạt/53skip; không chạy các test giao dịch live. Self-review tác giả, không review độc lập.

Bài đã sửa: https://fun.rich/post/26c9de27-1a4d-4153-b469-f3927fad277f . PR runtime: https://github.com/MinhTriDiamond/funprofile-supabase/pull/104 .

## Kiểm chứng phục hồi local

Đã sao lưu14.570tệp HLS (7.284segment video +init,7.284segment audio +init),2.748.588.017byte. MP4 remux2.758.959.012byte,1280×720,H.264/AAC,14.554,1005giây; không encode lại. Full-decode với video timebase1/90000 và audio1/48000 đạt, log lỗi0byte; SHA256 ở decode-proof.json. Lượt kiểm null muxer ban đầu báo một cảnh báo làm tròn timestamp ở timebase đầu ra; đã kiểm lại toàn bộ với timebase gốc, không bỏ qua lỗi decoder.

PR104 đã merge b226ce2 sau Preview1a139d4 (c64c3956). Ba Edge Functions deployed;7file đối chiếu6khớp byte và1chỉ khác BOM, tất cả khớp nội dung sau chuẩn hóa BOM. Auth production: thiếu/sai capability401, scope đúngHEAD200 đúng key. Khóa API tài khoản không được xuất; dùng capability mới12giờ, chỉ upload, gỡ sau khi xong.

Rollback sau khi Stream đã dọn: giữ URL R2 đã xác minh, không khôi phục URL Stream cũ từ snapshot (UID đã xóa không còn phát được). Snapshot dùng đối chiếu; nếu thật sự cần đưa lại lên Stream phải import bản MP4 sao lưu và gắn UID mới.
