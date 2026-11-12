# RTMP còn live nhưng feed hiển thị đang xử lý — 2026-11-12

Người thực hiện: Quang Vũ cùng Angel Muse. Nhánh: `fix/muse-live-feed-status`.

## Bằng chứng chỉ đọc production

- User `happycamlycoin`, post `1889899f-73cc-47f9-92f4-327ba4d96009`, session `4d306c6a-1613-4fa1-9203-18ebcef05f7e`.
- Post tạo 12:49:39 UTC, `post_type=live`, metadata `live_status=live`, có HLS video UID `58daaab96af35d76e945ad5b5b61388d`.
- Session: `status=ready_to_go_live`, `source_connected=true`, `connection_status=connected`, `live_input_status=live`, `ended_at=null`, có cả post_id/live_post_id và go_live_clicked_at.
- `host_connection_status=offline`, `last_seen_at=null`, `last_host_heartbeat_at=null`.
- Profile `is_live=false`, `current_live_session_id=null`; public route RPC trả rỗng vì status pre-live bị loại.
- Đã tải mã đang chạy của archive cron + go-live vào thư mục tạm; cả hai giống base repo (bỏ BOM). Lỗi có trên mã production, không chỉ bản local.

## Nguyên nhân

`live-replay-archive-cron` nhánh `current_video` chỉ giữ live khi status là reconnecting/disconnect_grace và đã có post. Khi status là live, cron lại ghi ready_to_go_live dù video đang live và post đã publish. Cron lặp lại lỗi mỗi lần quét, profile sync tắt is_live; route RPC không trả phiên pre-live nên feed xử lý như replay.

Đồng thời go-live không ghi tín hiệu sống mà frontend kiểm tra (`host_connection_status`, `last_seen_at`). RTMP không chạy heartbeat webcam. Dù sửa status đơn lẻ, header/media vẫn có thể hiển thị sai vì host mặc định offline.

## Bản sửa

- Helper `getRtmpActiveVideoPatch`: current video được xác nhận + đã có post (hoặc legacy live) ⇒ live; chưa publish giữ pre-live. Guard terminal/ended_at không hồi sinh phiên đã đóng.
- 3 nhánh recovery trong archive cron dùng helper và ghi host online/last_seen_at bằng thời điểm server xác nhận video; không ghi giả last_host_heartbeat_at.
- Go-live ghi host online/last_seen_at khi chuyển live sau kiểm tra nguồn.
- Không migration, không sửa route/RLS, không thay Cloudflare stream key hay video; không đổi chính sách replay HLS/R2.

## Kiểm chứng

- Test hồi quy ban đầu sao lại điều kiện cron cũ: 4 thất bại, chứng minh live/published pre-live bị hạ sai.
- 15 ca mới: published live/ready/source/reconnecting; live_post_id; legacy live; pre-live chưa publish; terminal/ended_at; hợp đồng frontend isFreshLiveSession/getPostPlayback.
- `bunx vitest run src/modules/live/ src/components/feed/postPlaybackResolver.test.ts`: 19 file / 117 test đạt.
- `tsgo --noEmit`: exit 0.
- `deno check --node-modules-dir=auto` 2 function: exit 0. Đã khôi phục dependencies bằng `bun install --frozen-lockfile` sau Deno check; không thay lockfile.
- Toàn repo: 494 đạt / 30 skip / 22 fail; 21 fail do sandbox DNS không truy cập Supabase, 1 file giá unavailable render lỗi đã được ghi nhận từ trước (xem hồ sơ 2026-11-09). Không coi toàn bộ test suite là pass.
- Review độc lập không thấy blocker mới. Race sẵn có: recovery update chỉ guard ended_at=null, có thể cạnh tranh với ending chưa có ended_at; ngoài phạm vi sửa này.

## Phát hành và khôi phục

PR: https://github.com/MinhTriDiamond/funprofile-supabase/pull/55 — chưa merge.

Version trước deploy: `go-live-rtmp-session` 89 và `live-replay-archive-cron` 98; cả hai ACTIVE, verify_jwt=false (xác thực bên trong function được giữ nguyên). Cron archive chạy mỗi phút.

Chưa deploy production ở thời điểm viết hồ sơ. Cloudflare Pages chỉ build frontend nên Preview không chứng minh Edge Function đã đổi.

Cần deploy đúng 2 function `live-replay-archive-cron`, `go-live-rtmp-session` sau cổng Preview/merge và quyền production thích hợp. Helper được bundle theo từng function; các function khác không gọi helper mới nên không cần deploy lại.

Trước deploy: lưu code function production ra thư mục tạm bằng `supabase functions download` (đã thực hiện); ghi version bằng functions list. Không cần UPDATE trực tiếp session: cron mới tự xác minh Cloudflare và sửa phiên còn nguồn.

Sau deploy: đọc lại session/profile/public route RPC; xác nhận status live + host online + last_seen_at mới, is_live=true. Chờ hơn một chu kỳ cron rồi đọc lại để chứng minh không bị hạ về ready. Xem bài trên profile/feed có nhãn live và HLS phát được. Nếu nguồn đã tắt thì không ép live.

Rollback: revert PR và deploy lại đúng 2 function từ bản trước. Không cần rollback schema/dữ liệu. Bản sao tạm mã function cũ: `/private/tmp/fun-live-feed-debug/supabase/functions/` (không chứa secret).
