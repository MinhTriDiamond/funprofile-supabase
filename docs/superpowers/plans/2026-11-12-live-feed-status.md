# RTMP live feed status repair

**Goal:** Phiên RTMP đã publish và còn video live phải giữ trạng thái live, feed có video và nhãn live.
**Architecture:** Cron không hạ phiên đã có post về pre-live. Khi Cloudflare xác nhận current video, cập nhật last_seen_at/host_connection_status để giao diện dùng cùng tín hiệu sống. Không giả heartbeat webcam hay bỏ kiểm tra ended_at.
**Tech stack:** Supabase Edge Functions, TypeScript, Vitest.
**Evidence:** Phiên 4d306c6a-1613-4fa1-9203-18ebcef05f7e có source_connected=true, live_input_status=live, post_id nhưng status=ready_to_go_live, host_connection_status=offline. Nhánh current_video trong archive cron ghi lùi status.

- [x] Test hồi quy: published live/ready/reconnecting + current video giữ live; chưa publish giữ pre-live; terminal không hồi sinh.
- [x] Helper trạng thái RTMP + patch tín hiệu video được xác nhận; dùng trong các nhánh recovery archive cron và go-live (grace watchdog không chứa lỗi hạ trạng thái live bình thường).
- [ ] Test, tsgo, Deno check, kiểm tra mã deploy và Preview/PR.
- [x] Chuẩn bị hồ sơ deploy/rollback; chỉ thay đổi production khi được phép theo quy trình.
