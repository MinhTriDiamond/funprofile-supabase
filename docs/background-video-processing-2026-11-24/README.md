# Video nền: Stream tạm → R2 private → dọn Stream

Ngày triển khai: 25/11/2026. Nhánh `feat/quangvu-background-video-processing`.

**Trạng thái hiện tại: đang chuẩn bị Preview và phát hành, chưa bật production.** Chỉ code/test đạt không được coi là tính năng đang hoạt động. Hồ sơ này sẽ bổ sung commit/PR, phiên bản function, canary và trạng thái cờ thực tế sau rollout.

## Hành vi

- Video mới tải vào R2 theo namespace owner, giới hạn hiện có 10 GiB. Bài public có attachment và upload session completed mới được enqueue; chưa chuyển mã hàng loạt bài cũ.
- Backend giữ hàng đợi/lease trong Postgres, gửi nguồn sang Stream bằng TUS từng phần tối đa 16 MiB, giới hạn thời lượng 14.400 giây ngay lúc CREATE. TUS URL hết hạn sau 6 giờ; không tạo lại mù khi mất phản hồi CREATE.
- Stream VOD tạm yêu cầu signed URLs; backend xác nhận private trước gửi bytes. Quyền export ngắn hạn chỉ nằm trong bộ nhớ backend.
- MP4 phải ready, nhỏ hơn nguồn, được chuyển/kiểm tra tại bucket private `fun-rich-video-optimized` trước khi publish nguyên tử. MP4 một mức chất lượng; không quảng cáo adaptive bitrate trên R2.
- Gateway `fun.rich/media-optimized/*` kiểm tra quyền hiện tại mỗi GET/HEAD/Range/download. Permit 5 phút trao đổi qua POST thành cookie HttpOnly; không đặt token vào URL hoặc metadata bài.
- Thay video, xóa mềm/cứng hoặc đổi private trước publish sẽ hủy tác vụ cũ. Chuyển private sau publish vẫn đọc bản R2 private theo owner/friend/block hiện tại.
- Chỉ dọn VOD thuộc đúng job/account, không live, không còn tham chiếu và đã có bản phát an toàn. Canary còn cần `delete_approved=true`; cờ xóa toàn cục vẫn bắt buộc. Không dọn VOD cũ ngoài job.
- Không tự xóa R2 original; output R2 không TTL. Vì vậy dung lượng bản phát giảm không đồng nghĩa tổng R2 chỉ còn bản nhỏ.

## Kiểm chứng trước phát hành

- Vitest: policy, nguồn/namespace, API Stream, range/transfer, processor/cancel, references, quyền private, cron, UI trạng thái, gia hạn giữ vị trí; kèm feed/RTMP regression. Số lượng cuối được ghi cùng receipt phát hành.
- `scripts/test-post-video-db.ts`: PostgreSQL loopback, database dùng một lần; kiểm RLS/quyền cột, claim đồng thời, lease đã nhả/hết hạn, publish nguyên tử, retry, source/privacy/delete/edit lifecycle. Không chạy fixture trên production.
- `scripts/test-post-video-media-browser.ts`: Chrome headless, MP4 tổng hợp 3 giây và R2/auth giả lập; phát, HEAD, Range, tải đủ, hết hạn/gia hạn và thu hồi yêu cầu kế tiếp.
- `scripts/test-post-video-worker-runtime.ts`: workerd thật với R2/auth giả lập; xác nhận Content-Length GET/206 và bytes đầy đủ. Workers dùng FixedLengthStream.
- Typecheck bằng `tsgo`, Deno check các Edge Function, build ứng dụng và Worker dry-run.
- Review độc lập toàn nhánh tại HEAD `a8ed916`, đối chiếu 5 Review Focus. Các phát hiện chặn phát hành được tái hiện/sửa trước canary; ghi riêng trong `review-resolution.md`.

## Thứ tự phát hành và cổng dừng

1. Chốt commit, PR và Preview đúng head; kiểm tra các đường cũ còn chạy. Reader frontend phải lên production trước khi canary publish locator mới.
2. Sao lưu source/config sáu function hiện hữu và snapshot đúng post/attachment canary vào `.local-backups/` (không commit dữ liệu/token).
3. Chỉ áp dụng bốn migration `20261125010000`–`20261125040000` đã review, theo transaction qua Management API/CLI; giữ cờ off và ghi migration history đúng bốn phiên bản. **Không chạy lại toàn bộ lịch sử:** trước rollout có 768 local-only và 6 remote versions; không repair lịch sử cũ trong việc này. Không dùng admin-sql cho DDL.
4. Tạo/kiểm bucket private: r2.dev disabled, không public custom domain. Secret mới chỉ ở secret manager, không qua chat/log/repo: POST_VIDEO_READ_SECRET, POST_VIDEO_GATEWAY_SECRET, POST_VIDEO_CRON_SECRET. Không mở rộng credential hoặc mua gói mới.
5. Deploy Worker và tám Edge Functions liên quan. Worker chỉ có bucket binding và secret chuyên dụng; không Supabase service-role key. Cron Worker mỗi phút, tối đa sáu tick có giới hạn; idle chỉ một tick. Không đưa secret vào SQL hoặc đụng schema vault.
6. Kiểm đúng source/version triển khai, auth từ chối caller không đủ quyền, private R2 read/write, quota còn chừa RTMP 240 phút. Sai một cổng thì giữ cờ off.
7. Canary đúng video MOV 6:08, 3.399.337.725 bytes: post `40ceb858-f80e-41eb-add3-d4fccc1856c0`, attachment `33bce8fa-2d4d-436c-a4ac-4cd091921477`. Nguồn legacy chỉ được cho phép qua marker do service/operator đối chiếu owner/session/key; không mở quyền cho upload legacy khác.
8. Canary không được xóa VOD khi chưa kiểm xong: output size/duration/audio, desktop/mobile, cookie/renew/seek/download, public→private và rollback. Dry-run phải chỉ ra đúng UID/account, tham chiếu, output đã kiểm chứng và trạng thái quyền xóa. Sau đó mới cho phép dọn đúng VOD canary.
9. Kiểm Stream 404, R2 HEAD/Range còn tốt và quota; chỉ bật public mới khi canary đạt. Ghi PR/main, phiên bản, cờ, cron receipt, số liệu trước/sau và tin Telegram kết quả.

## Khôi phục

- Dừng admission/publish/delete bằng cờ control; tắt lịch Worker nếu cần dừng cả tick. Canary bypass admission/publish để kiểm riêng nhưng **không** bypass cờ delete hoặc approval từng job.
- Không xóa original hoặc output R2 trong rollback. Lease/cancel ngăn callback cũ ghi lại bài đã đổi.
- Với bài đã publish: đối chiếu snapshot và HEAD/ETag source, khóa đúng job/post/attachment, chỉ thay locator gateway hiện tại về source tương ứng; giữ media khác/thứ tự và thay đổi nội dung mới của người dùng. Không restore nguyên snapshot post lên bài đã có chỉnh sửa khác.
- Revert code qua PR, phục hồi đúng function bundle đã sao lưu nếu cần. Không drop bảng jobs/snapshot khi còn tham chiếu hoặc tác vụ cần đối soát. Không đăng ký lại webhook account.

## Giới hạn cần đo bằng canary

- Dung lượng/quota, thời gian và chất lượng xuất chưa được suy từ unit test. Giữ chỗ quota nội bộ cố ý bảo thủ, có thể tính chồng phần provider đã giữ; đánh đổi là chờ lâu hơn để bảo vệ RTMP.
- Preview khác site có thể bị chặn cookie bên thứ ba, đặc biệt Safari. Không fallback public; production fun.rich dùng cùng origin. Cần ghi rõ trình duyệt thực tế đã kiểm.
- Không cam kết thu hồi byte đã tải, yêu cầu đang truyền hoặc URL original đã public từ luồng cũ.
- Mất CREATE response cần operator đối soát theo creator/job; không phát sinh import thứ hai để đoán.

Nguồn kỹ thuật: [TUS/Direct creator uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/), [private Stream](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/), [MP4 download](https://developers.cloudflare.com/stream/viewing-videos/download-videos/), [Workers FixedLengthStream](https://developers.cloudflare.com/workers/runtime-apis/response/).
