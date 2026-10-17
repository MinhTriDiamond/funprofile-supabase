# Thiết kế hardening chat và cuộc gọi Agora

**Ngày:** 2026-10-17
**Repo/nhánh:** `funprofile-supabase` / `fix/quangvu-chat-call-hardening`
**Trạng thái:** Chờ Cha review spec trước khi lập kế hoạch triển khai.

## Mục tiêu

Khôi phục gọi thoại/video với token Agora chỉ được cấp cho thành viên hợp lệ của đúng cuộc gọi; sửa các lỗi RLS và Realtime đã xác nhận; làm cho chuyển trạng thái cuộc gọi và cleanup có điều kiện, idempotent; đồng thời rà các luồng nhắn tin, nhóm và media để sửa lỗi cụ thể có bằng chứng mà không đổi trải nghiệm ngoài phạm vi.

Không deploy Edge Function, không áp migration, không đổi secret, không sửa dữ liệu production và không gọi tài khoản thật trong task.

## Bằng chứng hiện có

- `src/lib/agoraRtc.ts` gọi `agora-token` bằng `channel_name`; repo không có function nguồn đó. Token API không được ràng buộc với bản ghi cuộc gọi trong DB.
- `useAgoraCall` tạo call session/participant trước khi lấy token; một số lỗi insert/update bị bỏ qua. Nhánh lỗi đóng media tracks nhưng không nhất quán rời RTC client, hủy timer hoặc dọn bản ghi.
- Production ref đã đối chiếu qua Supabase CLI là `tljfqavndndfsvtazibe`. Truy vấn catalog chỉ đọc cho thấy publication hiện chỉ gồm `live_comments`, `live_messages`, `live_reactions`, `live_sessions`; bảng conversation/chat/call đang được đăng ký `postgres_changes` không có trong publication.
- Production policy `Users can view conversations they are part of` có điều kiện sai `conversation_participants.conversation_id = conversation_participants.id`; policy INSERT thành viên `Users can add participants to conversations` có so sánh tự thân `conversation_participants_1.conversation_id = conversation_participants_1.conversation_id`. Đây là policy tồn tại song song với các policy cũ.
- `conversation_participants` UPDATE policy chỉ `user_id = auth.uid()` nên thao tác admin gỡ thành viên không khớp. `user_blocks` SELECT chỉ cho `blocker_id = auth.uid()` trong khi hook còn truy vấn ai đã chặn người dùng hiện tại.
- Catalog production ghi nhận grant mặc định rộng cho `anon`/`authenticated`, bao gồm `TRUNCATE`, `REFERENCES`, `TRIGGER`; RLS đang bật trên tám bảng được kiểm tra. Migration cần thu hẹp grant theo các thao tác thực tế.
- Nhóm hook tạo conversation và participant qua nhiều request nên có thể để lại conversation dở dang. Group Settings có nút “Thêm” chưa nối hành vi.
- Upload chat gọi `get-upload-url`, dùng R2 public host `media.fun.rich`, key `comment-media/...`; URL media vì thế không có kiểm soát đọc theo conversation. `get-upload-url` kiểm tra đăng nhập, MIME, kích thước và path traversal nhưng việc xác minh ownership của đường dẫn và quyền tải chat cần được kiểm tra/fix riêng. Không thay bucket hay domain bằng secret mới trong task.
- Test SQL an toàn chưa chạy được: `pg_isready` báo không có server ở `/tmp:5432`; `supabase status` báo Docker/Podman không có. Chỉ truy vấn catalog production read-only đã chạy, không dùng production cho test ghi.
- `.lovable/memory/index.md` không có trong checkout.

## Các hướng đã cân nhắc

1. **Chỉ sửa policy và cấp token bằng client:** ít code nhưng client có thể gửi channel tùy ý, status transition vẫn dễ đua và tạo nhiều request không nguyên tử.
2. **Một Edge Function lớn cho mọi chat/call thao tác:** quyền kiểm tra tập trung nhưng tăng diện tích function, khó giữ các thay đổi DB nguyên tử nếu phải điều phối nhiều request.
3. **Đề xuất: token qua Edge Function riêng; chuyển đổi cần nguyên tử qua RPC SQL SECURITY DEFINER có xác thực caller; message CRUD tiếp tục dùng RLS đã chặt.** Các thao tác liên quan nhiều hàng được giữ trong một transaction PostgreSQL; Edge Function chỉ cấp credential cho phiên đã lưu. Phương án này dùng được cho nhiều client nhưng đòi hỏi migration review kỹ và test SQL thực trên local/staging trước phát hành.

## Thiết kế đề xuất

### 1. Token RTC cho cuộc gọi

- Thêm `supabase/functions/agora-call-token/index.ts`, riêng với `live-token`.
- Payload chỉ nhận `call_session_id`; function không nhận `channel_name`, UID hay role do client chọn.
- Handler xử lý `OPTIONS`, xác thực bearer JWT bằng `requireUser`, kiểm tra call row và conversation membership đang hoạt động, trạng thái `ringing/active`, người gọi/người tham gia phù hợp, cùng quy tắc block hai chiều cho các bên của cuộc gọi. Query lỗi hoặc dữ liệu thiếu trả lỗi có `code` và message tiếng Việt ổn định.
- Lấy channel từ `call_sessions`; dùng `AGORA_APP_ID` và `AGORA_APP_CERTIFICATE` hiện có. Token và UID trả về được dùng nguyên vẹn trong `client.join(appId, channel, token, uid)`. Không log credential, JWT hay token.
- Frontend chuyển sang API call-specific; không dùng `live-token` để cấp quyền gọi. CORS preflight được xử lý trong handler và function-level config.
- Thời hạn token có giới hạn; khi SDK báo token sắp hết hạn, client lấy lại token theo `call_session_id` và gọi `renewToken`. Callback cũ được bỏ qua nếu session hiện hành đã đổi.

### 2. Migration bảo vệ membership, trạng thái và Realtime

- Tạo migration mới idempotent theo lát cắt conversation/message/call để review và rollback rõ; không sửa migration lịch sử hoặc file generated.
- Xóa các policy lỗi theo tên đã xác nhận; thay bằng điều kiện có tương quan đúng. Không cho tự thêm mình vào conversation tùy ý; thay tạo DM/group, thêm/gỡ/rời thành viên bằng RPC có `auth.uid()` và kiểm tra admin ở DB.
- Tạo DM có khóa đồng bộ theo cặp user đã sắp xếp, kiểm tra block hai chiều và tái dùng hội thoại hiện hữu; tạo conversation và participants trong một transaction. Tạo group và initial members cũng nguyên tử.
- RPC quản lý nhóm chỉ cho admin đang hoạt động thêm/gỡ member; RPC leave chỉ cho chính user rời. Participant row được cập nhật lại khi mời thành viên đã rời để tôn trọng unique `(conversation_id,user_id)`.
- Thay các ghi trực tiếp vào `call_sessions`/`call_participants` bằng RPC start/accept/decline/end/timeout/update-participant có conditional status, participant validation, block validation và idempotent result. Một conversation không có hai cuộc gọi đang mở đồng thời; migration kiểm tra dữ liệu hiện có trước khi tạo unique partial index.
- Lưu `agora_uid` ổn định trên participant của từng call; RPC cấp/đọc UID kiểm tra membership và block, đảm bảo token renewal dùng đúng UID đã cấp. Channel do DB tạo từ UUID phiên, không nhận từ client.
- Thu hẹp quyền `anon`; thu hồi quyền không cần như `TRUNCATE`, `REFERENCES`, `TRIGGER`; giới hạn DML authenticated theo bảng/RPC. RLS áp dụng cho SELECT và message CRUD; RPC SECURITY DEFINER đặt `search_path` cố định, xác thực `auth.uid()`, và chỉ grant `EXECUTE` cho `authenticated` khi phù hợp.
- `conversation_participants` SELECT chỉ trả participant của conversation mà caller đang là thành viên hoạt động; `user_blocks` SELECT giới hạn các hàng có caller ở blocker hoặc blocked side, không mở danh sách toàn bảng.
- Message INSERT/UPDATE/DELETE yêu cầu sender hiện tại còn là thành viên; reply phải cùng conversation. Một hàm boolean bị giới hạn trong RLS kiểm tra block trực tiếp mà không cho client enumerate block rows.
- Sau khi sửa RLS, thêm `conversations`, `conversation_participants`, `messages`, `message_reads`, `message_reactions`, `call_sessions`, `call_participants` vào `supabase_realtime` nếu chưa tồn tại. Không bỏ các bảng đang có; không đưa `user_blocks` vào publication.

### 3. Gọi/nhận/kết thúc và cleanup phía client

- `useAgoraCall` dùng các RPC trạng thái nói trên; mọi error quan trọng được kiểm tra trước khi UI báo `ringing/connected/ended`.
- Một transition guard dùng chung chặn start/answer lặp; RPC là hàng rào cuối chống gọi chéo. Timeout 45 giây chỉ chuyển `ringing` nếu session vẫn `ringing`.
- Một cleanup path đóng tất cả track, unpublish khi cần, rời client, hủy duration/timeout/retry timer, xóa remote state, và chỉ cập nhật DB với session ID còn sở hữu. Token/join/publish/DB failure đi qua cleanup này; transition terminal trong DB dùng `WHERE status` tương ứng để không ghi đè trạng thái terminal.
- Gắn Agora listeners theo call generation/session ID để event cũ không kết thúc phiên mới. Auto-answer và nút Answer dùng cùng một flow, nhưng vẫn gọi permission API trong thao tác người dùng để hỗ trợ Safari.
- Remote audio playback bắt lỗi autoplay và cung cấp thao tác bật âm thanh sau gesture; không tuyên bố đã xác minh Safari/iPhone khi chưa có thiết bị thật.
- Kết thúc hai phía dùng RPC idempotent; trạng thái session không thể đổi ngược từ terminal. Network disconnect giữ SDK reconnect hiện hành và cho người dùng kết thúc/gọi lại; không thêm ghi âm.

### 4. Nhắn tin, tìm kiếm, typing và media

- Giữ phân trang 30 tin, optimistic update và dedupe theo message UUID; bảo đảm retry không làm mất nội dung/file của composer. Kiểm tra error khi tải profile/reply/read receipts và khi ghi read receipt.
- Giữ typing indicator dạng ephemeral broadcast, không chuyển nội dung typing vào bảng publication. Xác minh mọi query search và mutation reply/edit/delete/reaction/pin nằm trong conversation và bị RLS chặn khi rời nhóm/bị chặn.
- Media chat hiện trỏ tới URL R2 public. Tách key chat mới thành `chat-media/<authenticated-user-id>/...` để backend kiểm tra ownership mà không đổi key comment hiện hữu. Do R2 host hiện public, quyền đọc vật lý vẫn là public; để bảo đảm privacy theo conversation cần signed read URL hoặc bucket riêng/private và đổi rendering/download. Không tuyên bố file chat riêng tư nếu hạ tầng hiện tại vẫn public.
- Bước implementation sẽ kiểm tra hợp đồng `delete-from-r2`, metadata/key cũ, giới hạn hiện hành, các loại file và việc cleanup upload dở. Chỉ đổi read privacy nếu đường signed URL/key có thể được xác minh mà không phá comment-media hiện hữu; nếu chưa đủ bằng chứng, bàn giao rõ là phần chưa giải quyết và xin dữ liệu cấu hình từ dashboard, không đoán secret/domain.

### 5. Kiểm thử và phát hành

- Vitest: helper/policy endpoint cho OPTIONS/CORS, unauthenticated JWT, caller ngoài conversation, block hai chiều, input channel giả mạo, status terminal; client lifecycle race start/answer, token/join/publish/DB failure cleanup, late event, renewal; message optimistic rollback/dedupe/retry và upload validation.
- Deno check function mới và helper imports.
- Thêm SQL integration script/test chạy trong local hoặc staging an toàn: cách ly hai conversation, participant/admin boundaries, block, call transitions/uniqueness, function grants, publication membership. Dùng transaction fixtures và rollback. Production không dùng làm write-test.
- Chạy test liên quan, `tsgo --noEmit`, Deno check, `git diff --check`. Ghi riêng lỗi pre-existing.
- Bàn giao danh sách migration, `agora-call-token`, các function upload/chat nếu được sửa, frontend, thứ tự release. Không `db push` toàn bộ. Migration và deploy chỉ được người có quyền review/applied theo đợt phát hành riêng.
- Ma trận thiết bị cần test bởi Cha/người test: hai tài khoản desktop và iPhone; thoại/video; nhận/từ chối/nhỡ; offline/reconnect/gọi lại; DM/group/message; upload/download ảnh/video/file; Safari autoplay và quyền mic/camera. Không tự gọi người dùng thật.

## Phạm vi chưa thể xác minh

- Không thể chứng minh migration/RLS/RPC chạy thật cho đến khi có PostgreSQL local hoặc staging riêng. CLI chỉ liên kết production; production chỉ được query catalog read-only.
- Không có iPhone/Safari thật để xác minh permission/autoplay/camera switching.
- Không thể chứng minh riêng tư khi đọc file trên public R2 host. Nếu yêu cầu privacy chat theo conversation, cần thiết kế signed read access hoặc private bucket sau khi xác minh R2 policy/config.
- Cấu hình credentials Agora không được đọc; chỉ dùng tên secret đã có trong code. Không biết App Certificate đang tồn tại/khớp project trong production.

## Tài liệu kỹ thuật đối chiếu

- [Agora: Use tokens](https://docs.agora.io/en/realtime-media/rtc/build/authenticate-users/authentication-workflow) — token server nên ràng buộc channel và UID; client cần dùng cùng channel/UID để join; tài liệu mô tả renew qua callback hết hạn và `renewToken`.
- SDK đang khóa ở `agora-rtc-sdk-ng` 4.24.8; trước khi sửa client sẽ kiểm tra tên sự kiện và kiểu `renewToken` từ package typings đang cài.

## Phê duyệt và bước kế tiếp

Cha đã duyệt hướng thiết kế trong hội thoại. Spec này cần Cha review; sau khi Cha chấp thuận spec, bé mới viết implementation plan. Code/migration/function chưa được sửa ở bước này.
