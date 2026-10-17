# Chat/call hardening — release, rollback và kiểm thử thiết bị

Ngày chuẩn bị: 2026-10-17. Target production đã xác nhận: `tljfqavndndfsvtazibe`.

## Bằng chứng database

- Đã truy vấn chỉ đọc production catalog: 8 bảng conversation/message/block/call bật RLS; publication chỉ có `live_comments`, `live_messages`, `live_reactions`, `live_sessions`. Các policy/grant legacy và trigger liên quan được đối chiếu trong `docs/mailboxes/quang-vu.md`.
- Production có một cặp participant trùng trên call `ended`, không có duplicate participant đang active. Có 12 call row đang `ringing`/`active` trong 7 conversation: 9 ringing (đều quá 45 giây) và 3 active trong cùng một conversation, các active tạo ngày 2026-02-21. Không tự sửa hoặc kết luận các active là stale chỉ theo tuổi.
- Migration call vì vậy không tạo unique index cho mọi open call (nó sẽ thất bại vì dữ liệu hiện tại). RPC `start_call_session` dùng advisory lock theo conversation, chuyển ringing đã quá timeout sản phẩm 45 giây sang `missed`, sau đó từ chối tạo thêm call nếu còn session `pending`/`ringing`/`active`. Call active cũ vẫn cần operator xác minh; không tự kết thúc.
- Môi trường chạy: PostgreSQL 17.11 tạm trên localhost, `wal_level=logical`. Fixture dựng các cột/constraint/helper function/trigger/grants/policies đọc từ production, cùng ba user giả. `auth.uid()` là shim đọc `request.jwt.claim.sub`; role `authenticated` và claims được đặt riêng trong test. Publication PostgreSQL được tạo local.
- Không mô phỏng được GoTrue/JWT signature thật, PostgREST error mapping, Realtime service delivery, Edge Runtime/Agora network hoặc trigger/extension khác ngoài danh sách được fixture dựng. CLI `supabase db dump --linked` không chạy vì cần Docker; phần so schema được dựng từ query catalog chỉ đọc.

## SQL integration đã chạy

Lệnh trên database tạm `chat_hardening_test`:

```sh
psql -h /tmp -p 55432 -d chat_hardening_test -v ON_ERROR_STOP=1 -f supabase/tests/chat_security_realtime_fixture.sql
psql -h /tmp -p 55432 -d chat_hardening_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261017110000_chat_security_realtime.sql
psql -h /tmp -p 55432 -d chat_hardening_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261017111000_chat_message_access.sql
psql -h /tmp -p 55432 -d chat_hardening_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261017112000_agora_call_lifecycle.sql
psql -h /tmp -p 55432 -d chat_hardening_test -v ON_ERROR_STOP=1 \
  -v chat_user_a=10000000-0000-0000-0000-000000000001 \
  -v chat_user_b=10000000-0000-0000-0000-000000000002 \
  -v chat_user_c=10000000-0000-0000-0000-000000000003 \
  -f supabase/tests/chat_security_realtime.sql
```

Kết quả: cả ba migration chạy tuần tự; integration kết thúc `ROLLBACK` thành công. Kiểm tra gồm role/claims, RLS isolation, người ngoài không đọc/token/ghi call, participant rời nhóm không đọc/sửa/gửi, chỉ admin của đúng group quản lý thành viên, block hai chiều, DM retry, group membership retry/atomicity, RPC `SECURITY DEFINER` + `search_path`, EXECUTE/table grants, publication giữ bảng live và thêm bảng chat/call, UID token ổn định, stale ringing, terminal call guard và giữ nguyên hai participant row lịch sử trên call ended.

Race test tái lập bằng `bash supabase/tests/chat_call_concurrency.sh` trên database tạm đã cài fixture/migrations: hai `start_call_session` đồng thời chỉ một cái tạo call; thao tác accept/decline đồng thời chỉ một chuyển trạng thái thành công; hai end đồng thời chỉ một chốt `ended`; accept/decline trễ đều trả false sau terminal. Lượt concurrent start có một RPC từ chối với SQLSTATE `23505` như dự kiến; không tạo call thứ hai.

## Rollback từng migration/function

Các migration này thay thế hoặc loại bỏ policy/grant đã xác định là không an toàn. **Không tạo down migration khôi phục policy/grant cũ và không drop cột/index/RPC sau khi phát hành.** Rollback schema theo hướng tiến tới: giữ quyền chặt, sửa function/policy bằng migration forward-only và chạy SQL test lại.

| Thành phần | Rollback an toàn |
|---|---|
| `20261017110000_chat_security_realtime.sql` | Giữ RPC và policy hiện hành; không khôi phục self-join hoặc policy conversation sai tương quan. Nếu lỗi, phát hành migration forward sửa RPC/policy. Bảng Realtime add là additive; không gỡ bảng khỏi publication khi frontend còn dùng. |
| `20261017111000_chat_message_access.sql` | Giữ `can_message_conversation`, các policy active-member/block và pin RPC. Không khôi phục quyền gửi/sửa cho người đã rời hoặc reply chéo conversation. Lỗi xử lý bằng migration forward. |
| `20261017112000_agora_call_lifecycle.sql` | Giữ `agora_uid`, partial unique active-participant index và RPC lifecycle; không cấp lại direct call writes. Không rollback tự động call data. Sửa transition bằng `CREATE OR REPLACE FUNCTION` trong migration forward. |
| `agora-call-token` | Không gỡ function trong khi frontend dùng contract này. Lỗi token được sửa bằng forward deploy cùng interface; không thay bằng `live-token`. |
| `get-upload-url`, `delete-from-r2` | Giữ owner-prefix/MIME/size/delete checks. Nếu lỗi upload, forward patch hoặc tạm ẩn composer bằng frontend tương thích; không phục hồi endpoint không kiểm soát prefix. |
| Frontend | Không revert về build cũ trước RPC: nó còn ghi call/conversation trực tiếp và sẽ bị migration chặn. Fallback phải là frontend tiếp tục dùng RPC contracts nhưng có thể tắt tạm nút gọi/attachment qua forward release. |

Không chạy down script trên PostgreSQL vì down an toàn cho các policy security change không tồn tại. Local migration test xác nhận chuỗi DDL chạy xong, giữ nguyên fixture lịch sử và không restore legacy policy; đây không phải phép thử chạy ngược migration. Rollback được chuẩn bị theo hướng forward-only như bảng trên. Trước production cần snapshot/backup theo thủ tục vận hành và phê duyệt rõ việc giữ schema forward-only.

## Thứ tự phát hành đề nghị

1. Trên staging PostgreSQL/Supabase disposable, chạy đúng fixture/migrations/test; không dùng `supabase db push`.
2. Trước production, người vận hành rà và xử lý thủ công 3 `active` call row cũ ở một conversation; 9 `ringing` sẽ được RPC đánh dấu `missed` khi có lần gọi mới sau timeout 45 giây. Không chạy cleanup hàng loạt theo tuổi.
3. Xác nhận target `tljfqavndndfsvtazibe`, backup/recovery window, rồi áp ba migration riêng theo timestamp.
4. Trong cùng release window deploy `agora-call-token`, `get-upload-url`, `delete-from-r2`, sau đó phát hành frontend Cloudflare Pages. Migration thu hẹp direct writes nên phiên bản frontend cũ có thể tạm lỗi tạo group/call giữa migration và frontend mới; giảm khoảng này và buộc reload client.
5. Kiểm tra preview với hai tài khoản trước khi merge; theo dõi token denials/RPC codes, Realtime event delivery, duplicate call errors, media upload/retry và lỗi autoplay. Không có production deploy trong lượt chuẩn bị này.

## Ma trận desktop + Safari iPhone (hai tài khoản thử nghiệm)

- DM/group: tìm kiếm, tạo DM và retry, tạo group, add/remove/leave, quyền admin và cách ly người ngoài.
- Nhắn tin: gửi/nhận realtime, optimistic rollback, retry không trùng, phân trang, unread/read receipt, typing, reply/edit/delete, reaction, pin/unpin và search.
- File: ảnh/video/tài liệu trong giới hạn, MIME sai/quá cỡ, mất mạng khi upload và khi lưu message, retry cùng object, xóa file của mình và từ chối key người khác. Xác nhận rõ attachment dùng URL public.
- Gọi: thoại/video A→B, B nhận/từ chối/không trả lời, B→A đồng thời, bận/open call, kết thúc từ cả hai phía, mất mạng/reconnect/gọi lại, refresh trang, token renew khi gần hết hạn.
- iPhone Safari: cấp/từ chối mic-camera trong thao tác người dùng, autoplay audio bị chặn và bấm resume, chuyển background/foreground, khóa màn hình/mất mạng, chuyển camera và kết thúc ở cả hai phía.

Ghi lại từng lần thử với build/thiết bị, kết quả và lỗi đã khử định danh; không gọi người dùng thật.

## Media limitation và phát hành

Chat upload nằm dưới `chat-media/<user-id>/...`, nhưng read URL hiện là public `media.fun.rich`; người biết URL có thể mở file ngoài conversation. Không gọi media chat là riêng tư. Size validator nhận `fileSize` do client gửi trước presigned PUT; chưa có HEAD sau upload ràng buộc kích thước object thật. Nếu sản phẩm yêu cầu file đính kèm riêng tư thì đây là **blocker cho file sharing**: thêm signed-read endpoint kiểm tra active conversation membership rồi chỉ trả URL ngắn hạn. Nếu cần hard size cap chống client giả thì cũng là blocker cho tuyên bố giới hạn cứng: thêm server-side upload completion/HEAD verification trước khi lưu message. Chat text/call không phụ thuộc read URL; có thể tắt tạm composer attachment qua frontend nếu cần phát hành phần còn lại trước.

## Cửa sổ phát hành được Cha ủy quyền — 2026-10-18

- Phát hành chat text/call với upload file mới tạm dừng: shared policy `chatMediaRelease.ts` dùng chung cho frontend và endpoint presigned upload. Menu gửi file disabled, upload helper từ chối, endpoint trả `503 CHAT_ATTACHMENTS_PAUSED` cho prefix chat-media. Upload bài viết/avatar không bị khóa; link file cũ vẫn công khai. Chưa tuyên bố media riêng tư.
- Xác minh bổ sung production: cả ba call `active` legacy đều có `ended_at` khác NULL, không chỉ có bằng chứng tuổi bản ghi. Có thể sửa trạng thái đúng ba ID về `ended` với điều kiện `status='active' AND ended_at IS NOT NULL`, giữ nguyên timestamp, không đóng call khác hoặc cleanup theo tuổi.
- Ba migration cùng catalog assertions đã chạy thành công trên schema production trong giao dịch `ROLLBACK`, không giữ lại schema/data changes từ lượt thử. Snapshot catalog quyền/policy/publication trước phát hành được lưu ngoài repository tại `/tmp/funprofile-chat-release-20261018/catalog-before.json`; đây không phải backup đầy đủ database.
- Sau khi backend sẵn sàng, merge/push main và publish đúng Lovable project `331267a9-893e-47d1-8309-12038b7636f7` (FUN Profile Supabase). Project cũ ghi trong README không phải target phát hành.
- Hai tài khoản và Safari/iPhone thật vẫn là kiểm chứng operator cần thực hiện; catalog/fixture tests không thay thế RTC/audio/video end-to-end.

### Kết quả phát hành

- Migration 20261017110000/20261017111000/20261017112000 đã áp dụng đúng thứ tự trong một giao dịch và ghi nhận riêng từng version. Catalog assertions trước COMMIT và sau phát hành đều đạt. Publication có 11 bảng (7 chat/call + 4 livestream).
- Chỉ sửa status của đúng ba call legacy đã có ended_at; không còn call active trong ba ID đó, không đổi ended_at.
- Functions ACTIVE: agora-call-token v1, get-upload-url v78, delete-from-r2 v78. OPTIONS token 204; POST không đăng nhập 401.
- Code main 67bf611 đã push và Lovable xác nhận sync; publish request e8b7fe02-d4c9-425c-960f-a871a76a5038. Kiểm tra tài nguyên tải từ cả fun.rich và funprofile.lovable.app xác nhận bundle chat mới có endpoint token và giao diện tạm dừng gửi file.
- Vitest 20 test, Deno token 3 test, typecheck, Deno check và build production đạt. Chưa xác minh cuộc gọi hai thiết bị hay Safari/iPhone thật; người vận hành cần thử ma trận trên sau khi tải lại frontend.
