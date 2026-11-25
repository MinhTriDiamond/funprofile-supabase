# Đối chiếu review trước canary

Review độc lập toàn nhánh `5f82fa5..a8ed916`, hoàn tất ngày 25/11/2026. Các sửa dưới đây nằm trong một lượt sửa sau review; không coi review thay cho canary production.

| Phát hiện | Xử lý và bằng chứng |
| --- | --- |
| Stream tạm public, đổi private để lại VOD | TUS requiresignedurls; xác nhận private trước gửi bytes; signed export backend-only; đổi private trước publish hủy job và đi cleanup có fence. Processor/SQL/private tests. |
| Canary vượt công tắc xóa; fallback lệch job | Delete switch bắt buộc, approval riêng từng canary; fallback giữ jobId; dry-run kiểm UID/account/references/output trước quyền xóa. Canary approval tests. |
| Thiếu URL live/replay khi kiểm refs | Bổ sung hls_url/playback_url/playback_hls/dash/mp4/cloudflare_playback_url; test UID chỉ có trong URL vẫn được giữ. |
| pctComplete chuỗi và terminal export error | Chuẩn hóa tiến độ, readyToStream bắt buộc; error đưa vào retry hữu hạn. Tests dùng dữ liệu API dạng chuỗi. |
| Owner đọc runtime/upload capability | Quyền SELECT giới hạn cột trạng thái, không runtime/UID/lease; fixture kiểm quyền cột và RLS. |
| Đổi video qua EditPostDialog hoặc object cùng size | Trigger đồng bộ primary/media/attachment và hủy generation cũ; phiên bản R2 ETag và If-Match từng range; khóa nguồn có job khỏi upload overwrite. SQL edit và source-version tests. |
| Reservation hết hạn trước CREATE | Đọc usage/reserve lại ngay trước CREATE; thiếu quota không import. Admission test. |
| TUS Location opaque | Lấy UID từ stream-media-id; kiểm host/scheme độc lập với opaque path. Provider-shape test. |
| Profile/Edit preview thiếu cấp quyền | Dùng cùng OptimizedPostVideoPlayer tại feed/gallery/profile/edit. Typecheck và component/renewal tests; kiểm UI thật tại cổng canary. |
| Content-Length trên Workers | FixedLengthStream, tái hiện RED trên workerd thật rồi GET/206 GREEN. |
| Mọi part ghi lại feed | Chỉ cập nhật post khi presentation đổi; SQL test checkpoint không đổi updated_at. |

Author adversarial checks bổ sung: lease_until NULL không cho publish bằng token cũ; TUS tiếp tục từ offset nhà cung cấp đã nhận một phần; ordinary image deletion không bị guard giữ video thay đổi; mất quyền sau đổi account xóa cookie permit cũ.

## Minor hoãn

- Nút download ở gallery vẫn chưa đưa lỗi ra toast; không ảnh hưởng guard quyền nhưng cần cải thiện phản hồi người dùng.
- Pure policy và processor còn có nhánh quyết định trùng nhau; các safety case thực tế đã thêm vào processor tests, chưa refactor chung trong lượt này.

## Những điểm review để cổng triển khai quyết định

- Hosted schema/trigger/deployment order: đã đọc cột/thực trạng từ production; chỉ apply migration có transaction sau Preview, không suy từ fixture local.
- Canary legacy MOV: chỉ service/operator đối chiếu đúng post/attachment/session/key mới cấp marker; không nới quy tắc tự enqueue cho video legacy khác.
- Quota, thời gian TUS, size/duration/audio: đo thật, không công bố kết quả trước canary.
- Cookie Safari/mobile/cross-site Preview: ghi đúng môi trường đã test; không mở public nếu cookie bị chặn.
- Adaptive bitrate, batch lịch sử và tự xóa original vẫn ngoài V1.
