# Bản ghi RTMP trên bốn giờ — 28/11/2026

Cha đã xác nhận Telegram trước khi bắt đầu. Nhánh `fix/quangvu-long-rtmp-replay`.

## Chẩn đoán

Stream UID `4641dfe88bdfaf390fdca77d5707cb26`; session `1dbef509-286b-499b-b634-526d1c37d4f5`; replay `2dcca8db-db44-49b8-97cc-edf261682786`; post `26c9de27-1a4d-4153-b469-f3927fad277f`.

HLS video720p và audio đều có7284segment, ENDLIST, thời lượng14.554,1giây (4:02:34,1). Replay kẹt `mp4_export`, HTTP400, chưa có r2_object_key. Không phải bằng chứng mất bản ghi.

Cloudflare chỉ hỗ trợ xuất MP4 trực tiếp với bản ghi live không quá giới hạn4giờ; HLS/DASH vẫn còn phát lại: https://developers.cloudflare.com/stream/stream-live/download-stream-live-videos/ . Đây là giới hạn export của provider, không phải giới hạn thời lượng phát RTMP của ứng dụng.

## Bản sửa

- Phân biệt liveInput/duration từ metadata Stream, không áp giới hạn này cho uploaded VOD. Bản ghi live quá4giờ được nhận diện `live_mp4_duration_limit`, giữ HLS/nguồn và hẹn kiểm tra lại24giờ; không đánh dấu nguồn mất hoặc gửi thông báo recording unrecoverable. Poll cron tôn trọng hạn này.
- Phục hồi bản cụ thể bằng tải HLS có checkpoint, remux H.264/AAC thành MP4 không encode lại. Snapshot DB/playlists/raw media giữ ở thư mục local bị ignore `.local-backups/long-rtmp-replay-2026-11-28/`.
- `rtmp-recovery-upload` là công cụ vận hành, mặc định tắt khi không có capability. Chỉ một replay/UID, token bămSHA256 và hạn dùng; xác minh session public/ended/RTMP/owner trước mỗi yêu cầu. Chỉ tải multipart vào key dẫn xuất cố định. Không nhận key tùy ý, không xuất APIkeys, không có quyền publish hoặc xóa Stream. Cấu hình `RTMP_RECOVERY_UPLOAD_CAPABILITY` do operator tạo, không ghi giá trị vào Git/hồ sơ.
- Chỉ sau full-decode, remote size/SHA256 và playback đạt mới gắn bản R2 vào replay để pipeline hiện hữu cập nhật post. Không xóa nguồn trước kiểm chứng publication.

## Giới hạn

Bản sửa không thêm dịch vụ remux nền cho mọi phiên live dài tương lai. Các phiên đó được nhận diện và giữ nguồn HLS, cần chạy công cụ phục hồi hoặc bổ sung hạ tầng remux riêng. Không cắt/ngắt phiên live đang phát để tránh giới hạn export.

## Khôi phục

Trước deployment tải bundle cũ của archive/poll cron. Nếu có regression, redeploy bundle đã snapshot hoặc revert PR qua Preview. Gỡ capability sau phục hồi để khóa endpoint; có thể xóa function mới sau khi không còn upload hoạt động. Giữ bản MP4 phục hồi và snapshot DB. Không tự xóa R2 đang được bài feed tham chiếu; không reset source UID. Sau khi Stream bị dọn, UID cũ không khôi phục được, chỉ có thể nhập lại media với UID mới.

Kết quả rollout/publication sẽ ghi bổ sung sau khi kiểm chứng, chưa tuyên bố hoàn tất ở hồ sơ ban đầu này.
