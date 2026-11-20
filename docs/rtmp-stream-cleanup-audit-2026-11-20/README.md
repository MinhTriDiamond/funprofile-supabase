# Kiểm tra dung lượng Stream và tự xóa bản ghi RTMP — 20/11/2026

Người thực hiện: Quang Vũ cùng Angel Muse. Cha xác nhận đã gửi Telegram. Nhánh: `docs/quangvu-rtmp-stream-cleanup-audit`, từ `origin/main` tại `2c34adb`.

## Kết luận đã kiểm chứng

- Dashboard Cloudflare account đang mở hiển thị **534 video, 1.023/1.000 phút** tại thời điểm kiểm tra. Không thay đổi dung lượng hoặc xóa video.
- Live Input `42a132614bb80104397c470469dad7b9` là input của session mới nhất `54d8c6f7-7657-494d-a2b9-66cc9bfcf358` trên production Supabase `tljfqavndndfsvtazibe`.
- Logs của chính input này hiển thị `STORAGE_QUOTA_EXHAUSTED` (Account storage quota exceeded) và `STREAM_FAILED_TO_START` tại **2026-11-20 15:19:47 UTC**, tương đương **23:19:47 GMT+8**. Lỗi tương tự xuất hiện lúc 15:18:44, 15:17:41, 15:16:38 UTC. Nguyên nhân chặn các lượt live này là hết quota, đã xác minh trực tiếp.
- [Cloudflare troubleshooting](https://developers.cloudflare.com/stream/stream-live/troubleshooting/) cũng xác định hết quota là lỗi chặn playback/recording; khắc phục bằng xóa nội dung cũ hoặc tăng storage.

## Cơ chế trong repo

`supabase/functions/_shared/archiveReplayService.ts` có pipeline export MP4, upload R2, verify object/public playback, cập nhật replay/post, rồi `deleteCloudflareStreamAfterArchive()` gọi DELETE video Stream. `cloudflareStreamService.ts` coi DELETE 404 là đã xóa.

`cleanupArchivedStreamVideos()` được gọi trong `live-replay-archive-cron`: quét replay có provider R2, object key, URL R2, Cloudflare UID và thiếu dấu xóa hoặc có lỗi xóa; verify lại object/public URL trước khi thử xóa.

Mã chỉ xóa UID tương ứng replay. Việc quét thêm mọi video trên cùng input bị tắt mặc định (`delete_extra_stream_videos === true` mới chạy), nhằm tránh xóa nhầm bản ghi khác trên khóa RTMP dùng lại. Không nên bật quét xóa cả input để xử lý nhanh.

`stream-orphan-cleanup` có dry-run mặc định và không xóa UID không khớp DB nếu thiếu tùy chọn `delete_orphan_unknown=true`. Không gọi endpoint này ở lượt kiểm tra; không xem việc không có tham chiếu DB là bằng chứng video có thể xóa.

## Dữ liệu production chỉ đọc

Truy vấn qua Supabase CLI `db query --linked`, liên kết đã xác nhận đúng project production; không dùng project Lovable cũ.

| Trạng thái replay RTMP | Số replay | Có URL R2 | Có stream_deleted_at |
|---|---:|---:|---:|
| archived | 123 | 123 | 123 |
| replay_posted | 345 | 345 | 345 |
| pending | 11 | 0 | 0 |
| unrecoverable | 37 | 0 | 15 |

468 replay có URL R2 và dấu xóa Stream trong DB. Đây là bằng chứng DB ghi nhận pipeline đã xử lý; chưa HEAD lại tất cả object R2 hoặc gọi API xác minh 468 UID thực sự đã biến mất. Không có `delete_stream_error` trên các replay RTMP tại snapshot. Nhóm unrecoverable mang lỗi Stream UID 404 trong DB; chưa xác minh lại từng UID.

Ví dụ gần nhất có replay: session `fe2d64e6-c042-40ce-b528-106a6f273ea7`, kết thúc 17/11 lúc 16:25:16 UTC, có URL R2 và dấu xóa lúc 17:25:18 UTC. Việc xóa diễn ra sau archive, không ngay khi bấm kết thúc live.

Cron `live-replay-archive-every-1min` active, lịch `* * * * *`, trỏ đúng production. Các lần cron gần nhất tới 15:51 UTC báo succeeded/1 row; điều này chỉ chứng minh SQL tạo HTTP request, không chứng minh HTTP handler hoặc DELETE thành công. Có `live-rtmp-cleanup-stuck-every-30min`; không thấy cron có tên/đích Stream orphan cleanup trong truy vấn lọc jobname stream/rtmp/replay-archive.

## Video tồn ngoài luồng replay

UID đọc trực tiếp từ dashboard Hosted videos, đối chiếu bằng SELECT:

| Video Cloudflare | UID | Session khớp UID | Replay khớp UID | Post tham chiếu video_url/metadata |
|---|---|---:|---:|---:|
| Persistent OBS Live 18 Nov 12:44 UTC | `1f2fa1ad3edcece1ac91c0bfd57b79e6` | 0 | 0 | 0 |
| Persistent OBS Live 18 Nov 04:40 UTC | `ef247d9971654b03e10e607529004c09` | 0 | 0 | 0 |
| Persistent OBS Live 17 Nov 21:54 UTC | `fbf2bbefecb1d36d1c6aceae8613a211` | 0 | 0 | 0 |
| Persistent OBS Live 12 Nov 08:24 UTC | `99a6868308ebf1542719189efe3d0550` | 1 | 0 | 0 |

Video đầu tiên Ready, dài **1:48:57**, tùy chọn Automatically Delete Video tắt. Chưa xác minh nó có bản sao R2 độc lập hay không. Phép đối chiếu trên không bao gồm mọi bảng/media_urls/link ngoài nền tảng, do đó không phải danh sách xóa an toàn.

Ba video mới nhất không có replay tương ứng nên nằm ngoài tập quét của watchdog theo replay. Đây là lỗ hổng bao phủ đã xác nhận ở mẫu kiểm tra, chưa kết luận nguyên nhân vì sao chúng không được liên kết vào DB (ví dụ phát trên khóa cố định ngoài phiên, webhook hoặc nhận diện phiên). Chưa kiểm kê toàn bộ 534 video, không khẳng định chúng đều là bản ghi RTMP thừa.

Phát hiện phụ trong mã: `deleteCloudflareStreamAfterArchive()` bắt và lưu lỗi thay vì throw, nhưng caller cleanup vẫn tăng `deleted`; số đếm cleanup có thể báo thành công khi DELETE lỗi. Đây là vấn đề khả năng quan sát, chưa có bằng chứng nó gây hết quota hiện tại.

## Hướng xử lý tiếp theo

1. Kiểm kê video Stream theo UID/input/thời điểm/duration, đối chiếu session/replay/post và bản R2 thật; phân biệt nội dung cần giữ với bản ghi phát sinh ngoài phiên.
2. Với video chưa có R2, lưu bản backup và xác minh đủ nội dung/phát được trước khi đề nghị xóa. Xóa Stream vĩnh viễn nên cần danh sách cụ thể được Cha duyệt; không xóa hàng loạt chỉ theo tuổi hoặc tên.
3. Sửa luồng nhận diện/tiếp nhận recording trên persistent input để không bỏ sót, bổ sung dọn theo từng UID đã archive xác minh, sửa báo đếm DELETE lỗi và cảnh báo dung lượng trước khi live. Cần ghi nhận phạm vi sửa riêng trước triển khai.
4. Nếu cần mở live ngay trước khi dọn an toàn xong, có thể tăng storage trên dashboard theo quyết định của Cha; chưa thay đổi gói trong lượt kiểm tra.

## Phạm vi thay đổi và kiểm chứng

Chỉ thêm hồ sơ và ghi hộp thư trên nhánh tài liệu. Không thay source/schema/cron/config/secret, không deploy, không xóa dữ liệu production, không thử phát live. Không chạy typecheck/test vì không đổi mã. Kiểm tra `git diff --check` và đọc lại hồ sơ. Chưa commit/push/PR/merge; không tuyên bố đã khắc phục hoặc đã lên fun.rich. Hoàn tác tài liệu bằng bỏ đúng diff của lượt kiểm tra, không cần rollback production.

## Tin Telegram kết quả kiểm tra

> Quang Vũ · Đã kiểm tra lỗi RTMP và tự dọn Stream. Log input xác nhận STORAGE_QUOTA_EXHAUSTED làm stream không khởi động; dashboard 534 video, 1.023/1.000 phút. Pipeline có tự xóa sau archive R2: DB ghi nhận 468 replay RTMP có URL R2 và dấu xóa. Đối chiếu ba video tồn ngày 17–18/11 không tìm thấy session/replay/post khớp UID, nên watchdog theo replay bỏ ngoài phạm vi. Đã ghi hồ sơ và hướng kiểm kê/backup trước khi dọn; chưa xóa video, chưa tăng gói, chưa sửa/deploy. Dung lượng trước/sau vẫn 1.023/1.000 phút; mới hoàn tất chẩn đoán, chưa khắc phục. Kết quả giúp phân biệt replay đã xử lý với bản ghi chưa được quản lý để tránh xóa mất nội dung. Hồ sơ local: docs/rtmp-stream-cleanup-audit-2026-11-20/README.md; chưa có PR.

## Tiếp tục xử lý — 21/11/2026 (GMT+8)

Cha đã đồng ý tiếp tục sau báo cáo. Phạm vi bổ sung đã ghi vào hộp thư trước thao tác.

- Tải source `stream-webhook` và `stream-orphan-cleanup` đang deploy về thư mục tạm qua CLI; source webhook khớp file repo. Không deploy lại.
- Gọi `stream-orphan-cleanup` **dry_run=true**, delete_orphan_unknown=false, qua net.http_post với secret Vault giữ trong DB: request 234266 trả HTTP 401. Thử lại bằng header cron archive sẵn có, giữ hoàn toàn trong DB: request 234279 cũng trả HTTP 401. Không có lệnh DELETE; dry-run chưa cho ra inventory. Không thay secret/header cron.
- Tự động duyệt từ chối bước đọc secret API key bằng CLI `--reveal`, do thiếu ủy quyền cụ thể để lấy secret. Lệnh không được thực hiện và không thử lấy khóa qua đường khác. Chuyển sang dashboard đã đăng nhập và public playback để sao lưu.
- Đã chọn Generate Download MP4 cho đúng ba UID ngày 17–18/11 trên dashboard. Đây là thay đổi production tạo bản MP4 downloadable, không xóa recording; public playback đã công khai trước đó. Không đổi signed-URL/allowed-origin/auto-delete. MP4 chưa sẵn sàng sau vòng chờ khoảng 7 phút; đã thấy tiến độ xuất trên UI.
- Đang sao lưu qua HLS public chất lượng cao nhất, tải đủ track video/audio, ghép MP4 không encode lại, kiểm tra thời lượng/codec/SHA-256; file ở `.local-backups/rtmp-stream-2026-11-21/`, có `.gitignore` nội bộ để không vào Git. Chưa được coi backup hoàn tất trước khi có kết quả kiểm chứng.
- Bucket R2 mà replay production sử dụng là `fun-rich-media`, URL `https://media.fun.rich/...`. Tìm đúng tên trên tài khoản Stream c94ab... không thấy bucket. Tài khoản Cloudflare được chia sẻ b57b... báo không có quyền xem R2. Không upload vào bucket khác, không tạo token hoặc thay quyền. Đã hỏi Cha tài khoản chứa bucket bằng câu hỏi bất đồng bộ; backup local tiếp tục.
- Dashboard Recordings của input `42a132614bb80104397c470469dad7b9` hiển thị **19 recording**. Đã đọc cả 4 trang; danh sách tại `input-recording-uids.json`, SQL đối chiếu chỉ đọc tại `input-recording-audit.sql`. Không khẳng định 534 video của toàn account đều thuộc input này.

### Điều kiện dọn đã chốt cho thao tác kế tiếp

Chỉ lập danh sách UID đã có backup kiểm chứng, ghi rõ nơi giữ bản sao, thời lượng, SHA-256, tham chiếu DB đã kiểm tra và giới hạn kiểm tra. Trước nút xóa vĩnh viễn trên dashboard phải xin Cha xác nhận đúng danh sách tại thời điểm thao tác theo chính sách Computer Use. Xóa không thể khôi phục UID Stream cũ; nếu cần phục hồi nội dung phải upload lại từ bản sao và thay link. Chưa xóa video hoặc thay chính sách retention.

### Kết quả bổ sung kiểm kê và bản sửa

- Cả 19 recording trên input không khớp trực tiếp stream_uid/cloudflare_video_uid ở live_replays. Có 8 UID khớp live_sessions và 6 UID còn được tham chiếu từ post (video_url/media_urls/metadata); không xóa nhóm có tham chiếu. Không suy diễn rằng các session đó không có replay: đối chiếu thêm theo live_session_id xác nhận một số replay tồn tại nhưng cả hai UID null.
- 11/11 replay RTMP pending thiếu cả hai UID trong khi session có UID. Archive lọc stream_uid khác null, recovery cũ skip bất kỳ replay có id. Đây là lỗi phục hồi nguồn đã xác nhận trong code production (cron khác repo chỉ BOM).
- Bản vá local tách recovery thành shared service, giữ strict selector cũ, phục hồi UID trên đúng replay placeholder với điều kiện source/R2/status/lease chưa đổi; giữ id/chunked_recording_id hiện có. Không tạo replay công khai cho pre-live.
- Review độc lập phát hiện thêm batch 30 có thể che phiên phía sau và lỗi một hàng chặn toàn cron. Đã chuyển sang keyset theo id, bulk lookup replay theo session ID (production không có FK để embed), giới hạn5 recovery thành công/tick, cooldown 10 phút khi placeholder strict mismatch, cô lập lỗi từng hàng và catch lỗi batch trong cron để archive/cleanup tiếp tục.
- Regression từng thất bại trước sửa: existing placeholder bỏ qua; sửa làm đổi chunked_recording_id; target sau30healthy không được quét; writeerror thoát toàn recovery. Sau sửa: 34 test của4file liên quan đạt; tsgo và deno check entrypoint đạt.
- Full suite đã chạy: 76 file pass, 10 file fail; 525 test pass, 23 fail, 30 skip. Các nhóm fail: a1-admin-guard/batch2, admin-backfill-guard, btc-pending-verification-sweep, check-login-method-containment, log-security-action-guard, recalculate-user-financial-guard, run-financial-reconciliation-guard, user-directory-split-guard, prices-unavailable.render. Có ENOTFOUND production REST, một timeout offline check-login-method và TypeError đọc bind trong test giá; không tuyên bố full suite pass. Log local: /private/tmp/fun-stream-audit-runtime/vitest-full.log.
- Ba MP4 HLS backup đã đủ segment, cấu trúc MP4 hợp lệ, codec hình/tiếng và thời lượng khớp; SHA-256 và dung lượng tại backup-manifest.json. Đang full decode trước khi coi đủ điều kiện xóa. Chưa upload R2, chưa xóa Stream.

### Chốt backup local và review mã

Ba file backup đã full-decode cả hình/tiếng bằng ffmpeg `-xerror`, exit0, sau khi kiểm tra tất cả segment, thời lượng và SHA-256. Có cảnh báo non-monotonic DTS từ null output muxer trong lượt decode; không gọi kết quả log là sạch hoàn toàn. Các file MP4 và JSON kiểm chứng vẫn giữ trong `.local-backups/rtmp-stream-2026-11-21/`. Chưa upload sang R2 và chưa xóa Stream. Nếu xóa nguồn, UID/link Stream cũ không phục hồi nguyên trạng; chỉ có thể upload lại nội dung từ backup.

Sau review, recovery đã đổi giới hạn thành **5 lần thử** (kể cả thất bại), deadline mềm 15 giây giữa các lần thử, và chạy **sau** archive/cleanup chính. Cooldown10 phút dùng `live_sessions.archive_next_retry_at` có sẵn trong production, cập nhật CAS; không cần migration. Session chưa thử được ưu tiên trước, session retry đến hạn xếp theo retry-at rồiid bằng composite keyset. Regression50 mismatch +target thứ 51 với đồng hồ tăng60 giây/tick đã được bổ sung; mutation đảo priority làm test thất bại. Review cuối không còn Critical/Important trong phạm vi mã.

Baseline Edge source đã tải từ production và lưu local tại `.local-backups/edge-before-rtmp-recovery-2026-11-21/functions/` để rollback đúng closure. Không chứa giá trị env/secret; không đưa backup/media vào Git.

## Phát hành đã xác minh — 21/11/2026

- PR https://github.com/MinhTriDiamond/funprofile-supabase/pull/65 đã merge squash `1ca040c397b68e306e641f51a158b1d853189488`; code head `34e17c1c055519788a9afee7ed9d68d4eaee5966`. Nhánh code remote đã xóa.
- Cổng Preview: Cloudflare check SUCCESS đúng head, https://fca9fa30.funprofile-supabase.pages.dev. Đã gửi link cho Cha và xác minh HTML/JS HTTP200. Bản vá không đổi frontend. Không suy diễn rằng Preview đã chạy backend mới.
- Deploy duy nhất `live-replay-archive-cron` vào `tljfqavndndfsvtazibe`; CLI xác nhận ACTIVE **v100**. Tải lại entrypoint và `_shared/rtmpReplayRecovery.ts`, so sánh khớp repo (bỏ BOM). Không thay function khác, auth, secret, migration hoặc lịch cron.
- Trước deploy đã lưu backup **11 replay và11 session** (chỉ trường trạng thái của session, không stream key) tại `.local-backups/rtmp-stream-2026-11-21/db-before-recovery.json`. Backup không ở Git.
- Sau deploy: nhóm11pending đã có **2 stream_uid khác null**, trước đó0. Chưa có URL R2 hoặc dấu xóa mới trong nhóm này ở snapshot; không coi archive/dọn đã hoàn tất. Các nhóm cũ123 archived và345 replay_posted giữ nguyên số lượng. Không gọi endpoint archive/xóa thủ công.
- 36 test liên quan / 4 file, tsgo và deno check đạt; full suite có các lỗi đã liệt kê ở trên. Review cuối không còn Critical/Important.
- Chưa xác minh live thật đã khởi động lại; quota vẫn cần theo dõi. Ba UID ngoài replay đã có backup local, chưa có upload R2 mới và chưa xóa bản Stream. Chờ Cha xác nhận đúng ba UID trước thao tác xóa vĩnh viễn.

### Danh sách đề nghị dọn sau xác nhận

| UTC/name | UID | Thời lượng | Backup local |
|---|---|---|---|
| 18/11 12:44 | `1f2fa1ad3edcece1ac91c0bfd57b79e6` | 1:48:57 | `<UID>-hls-backup.mp4` |
| 18/11 04:40 | `ef247d9971654b03e10e607529004c09` | 1:30:34 | `<UID>-hls-backup.mp4` |
| 17/11 21:54 | `fbf2bbefecb1d36d1c6aceae8613a211` | 1:29:30 | `<UID>-hls-backup.mp4` |

Đã kiểm tra không có tham chiếu trong session UID, replay UID, post video_url/media_urls/metadata, comments.video_url và profiles.cover_url. Không kiểm soát link được chia sẻ ngoài platform. Tổng khoảng289 phút; nếu không có thay đổi khác, xóa3 bản này dự kiến đưa quota từ1.023 về khoảng734phút, cần đo lại dashboard sau thao tác. File local tổng2.765.958.396 byte, đủ audio/video, duration và hash theo backup-manifest.json. Nguồn HLS là bản encode chất lượng cao nhất có sẵn, không tuyên bố là file gốc từ encoder.

### Rollback bản vá

Nếu recovery mới gây lỗi: deploy lại đúng closure đã tải trước đó từ `.local-backups/edge-before-rtmp-recovery-2026-11-21/functions/`. Chuẩn bị thư mục tạm có cấu trúc `supabase/functions/`, copy config hiện có (không sửa auth) và deploy duy nhất `live-replay-archive-cron` bằng `--project-ref tljfqavndndfsvtazibe --use-api --workdir <thư-mục-tạm>`. Không rollback mù dữ liệu từ JSON vì archive/R2/Stream có thể đã tiến tiếp; phải đối chiếu từng hàng và nguồn còn tồn trước khi phục hồi. Không xóa R2 mới. Các marker retry tự hết hạn.

### Tin Telegram cập nhật

> Quang Vũ · Đã merge PR #65 và deploy archive cron v100 ACTIVE; sửa lỗi replay pending có hàng nhưng thiếu UID bị bỏ qua. Có guard strict/CAS, luân phiên và giới hạn lượt thử, lỗi recovery không chặn archive/cleanup. 36 test liên quan +tsgo +Deno đạt; review không còn blocker. Sau deploy 2/11 replay đã có UID trở lại (trước 0), chưa xác nhận archive hoàn tất. Đã kiểm kê19 recording đúng input, backup3 bản ngày 17–18/11 (~289 phút,2,77 GB) đủ hình/tiếng/hash/full decode. Chưa xóa chúng, chưa có bản sao R2 mới; cần xác nhận danh sách để dọn vĩnh viễn và đo lại quota. Việc này bảo toàn nội dung, gỡ điểm kẹt tự phục hồi và chuẩn bị giải phóng dung lượng cho RTMP. PR: https://github.com/MinhTriDiamond/funprofile-supabase/pull/65 .

## Kiểm chứng runtime và chuẩn bị backup R2 bổ sung

Snapshot tiếp theo trên đúng 11 replay đã backup: **6 replay đã có UID/R2 và dấu xóa Stream**, còn 5 pending chưa có UID. Kiểm chứng ngoài DB trên 6 media: R2 HEAD200, Content-Length bằng filesize_bytes; HLS Stream cũ HEAD404. Bằng chứng tại `runtime-media-verification.json`. Đây là xác minh luồng tự lưu và tự dọn thực sự đã tiến sau v100, không chỉ dấu DB. Chưa test phát live thật hoặc đo lại phút quota trên dashboard. Không ép xử lý 5 hàng không đủ strict match.

Trình duyệt đã mở đúng account production `6083e34ad429331916b93ba8a5ede81d` và bucket `fun-rich-media`. Dashboard R2 giới hạn 300 MB/file. Đã tạo prefix trống `rtmp-stream-backups-2026-11-21/` và chia 3 MP4 local thành 10 phần dưới 300 MB, kèm `manifest.json` và `restore_backups.py`: tổng 12 file, khoảng 2,77 GB. Đã chạy ghép phục hồi thử trên cả 3 video, SHA-256 toàn file khớp hoàn toàn. Manifest phần tại `r2-backup-parts-manifest.json`. Đây là backup để ghép lại, không phải 3 URL MP4 phát trực tiếp trên R2.

**Upload chưa thực hiện.** Bước bấm Mở ở hộp chọn đúng 12 file bị automatic approval review từ chối vì cần xác nhận trực tiếp cho payload video và bucket đích đang bật public access. Không thử đường khác để truyền dữ liệu. Câu hỏi xác nhận upload đúng 12 file vào đúng prefix/account đã gửi Cha; chờ trả lời. Hộp chọn file đang giữ 12 file đã chọn. Ba video Stream mới ngoài phiên vẫn còn nguyên; thao tác xóa vĩnh viễn vẫn cần xác nhận riêng tại bước xóa. Không lấy/reveal API key.

Tin Telegram cập nhật số liệu mới: PR65/v100 đã khôi phục 6 replay, R2 HEAD200 đủsize và Stream cũ404; còn 5 pending chưa đủ nguồn nên giữ nguyên. Backup local 3 bản mới (~289 phút/2,77 GB) đã full-decode và thử ghép/hash; prefix R2 bổ sung đã chuẩn bị nhưng chưa upload vì đang chờ Cha xác nhận payload/bucket public. Chưa tuyên bố live thật đã hoạt động lại.
