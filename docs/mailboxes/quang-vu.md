# Hộp thư của Quang Vũ — Livestream / Agora

> Việc mới nhất nằm ở trên cùng. Vũ phản hồi trạng thái ngay dưới mỗi mục nhé.

## 2026-11-21 — HOÀN TẤT UPLOAD BACKUP R2, QUOTA ĐÃ GIẢM

- Cha đã xác nhận trực tiếp upload đúng 12 file vào bucket/prefix public đã nêu. Dashboard 12/12 thành công; đọc lại toàn bộ 10 phần video + manifest + script từ R2, SHA-256 và size cả 12 file khớp local. Manifest và bằng chứng tại `docs/rtmp-stream-cleanup-audit-2026-11-20/r2-remote-verification.json`.
- Tải mới dashboard Stream: 529 video, 722/1.000 phút, giảm 301 phút so với 1.023/1.000; tại snapshot còn 278 phút trống. 6 replay khôi phục đã có R2 và nguồn Stream cũ 404; còn 5 replay không đủ nguồn giữ guard. Chưa mở live thử.
- Ba recording ngoài phiên ngày 17–18/11 vẫn còn nguyên trên Stream, nay có backup local và R2 (~289 phút/2,77 GB). Xác nhận vừa rồi chỉ cho upload, chưa xóa thủ công thêm nguồn.
- Source fix đã merge PR #65/deploy v100; cập nhật hồ sơ trong PR #66. README có rollback và tin Telegram để Cha copy. Không đổi secret/schema/cron hay quyền bucket.

## 2026-11-21 — KIỂM CHỨNG SAU V100: 6 replay đã lưu R2 và dọn Stream

- Trên đúng 11 replay backup: 6 hàng đã có nguồn/R2/dấu xóa, còn 5 pending chưa đủ nguồn. HEAD thật: cả 6 URL R2 HTTP200 và size khớp; 6 HLS Stream cũ HTTP404. Không ép map nguồn cho 5 hàng còn lại, chưa test live thật/đo lại quota dashboard.
- Đã mở đúng bucket production `fun-rich-media`; tạo prefix trống `rtmp-stream-backups-2026-11-21/`. Chuẩn bị 10 phần video dưới 300 MB + manifest + script ghép, tổng 12 file ~2,77GB; thử ghép cả 3 video khớp SHA-256.
- Upload chưa thực hiện: automatic approval review từ chối nút Mở do cần Cha xác nhận trực tiếp payload/bucket đang public. Đã hỏi đúng 12 file/account/prefix; đang chờ. Không bypass hoặc lấy secret. Ba bản Stream ngoài phiên chưa xóa.
- Hồ sơ: `docs/rtmp-stream-cleanup-audit-2026-11-20/README.md`, manifest phần và runtime-media-verification.json. PR hồ sơ #66 đang cập nhật, nhánh `docs/quangvu-rtmp-recovery-release`.

## 2026-11-21 — ĐÃ MERGE/DEPLOY: recovery RTMP, chờ xác nhận dọn3 recording

- PR #65 https://github.com/MinhTriDiamond/funprofile-supabase/pull/65 merge squash `1ca040c`, nhánh code remote đã xóa. Preview head `34e17c1` SUCCESS https://fca9fa30.funprofile-supabase.pages.dev, HTML/JS200, link đã gửi Cha.
- `live-replay-archive-cron` v100 ACTIVE trên production tljfqavndndfsvtazibe, tải lại source khớp mã review. Không đổi auth/secret/schema/cron. Backup source và11 replay/11 session đã lưu local trước deploy.
- Sau deploy 2/11 replay pending đã có UID (trước 0), chưa có R2/dấu xóa mới. Ba recording ngoài replay đã backup local ~289 phút/2,77 GB, kiểm tra duration/audio/video/hash/full decode exit0; cảnh báo timestamp đã ghi rõ. Chưa upload R2 mới/chưa xóa3 nguồn/chưa xác nhận live thật hoạt động lại.
- 36 test liên quan +tsgo+Deno đạt; full suite chưa pass như hồ sơ đã nêu. Review cuối không còn Critical/Important. Kết quả và rollback: `docs/rtmp-stream-cleanup-audit-2026-11-20/README.md`; danh sách3 UID+manifest đã sẵn để Cha xác nhận tại thao tác xóa vĩnh viễn. Nhánh hồ sơ: `docs/quangvu-rtmp-recovery-release`.

## 2026-11-21 — ĐÃ CHUẨN BỊ BẢN VÁ VÀ BACKUP RTMP

- Ba recording mới ngày 17–18/11 đã backup local đủ hình/tiếng, tổng2.765.958.396 byte, thời lượng289 phút 1 giây; SHA-256 tại `docs/rtmp-stream-cleanup-audit-2026-11-20/backup-manifest.json`. Full decode exit0; có cảnh báo timestamp ở null output muxer được ghi rõ. Chưa có bản sao R2 mới vì chưa truy cập đúng bucket production; không xóa nguồn.
- Bản vá `rtmpReplayRecovery` giữ strict matching, phục hồi placeholder thiếuUID bằng CAS, giữ identity, quét keyset ưu tiên chưathử rồi retrycũ; tối đa5 lần thử/tick +deadline mềm15 giây, cooldownsession 10 phút. Recovery chạy sau archive/cleanup; lỗi từng hàng/batch không chặn job chính. Production có sẵn session.archive_next_retry_at, không migration.
- 36 test liên quan /4file +tsgo +deno check đạt; review độc lập không còn Critical/Important. Fullsuite đã chạy và có23 test fail/10 file do nhóm REST/DNS, timeout và test giá; hồ sơ nêu chi tiết, không coi full suite pass. Chuẩn bị commit/PR/Preview; chưa merge/deploy.

## 2026-11-21 — BỔ SUNG PHẠM VI: sửa recovery replay RTMP thiếu UID

- Theo chỉ đạo tiếp tục của Cha; production xác nhận 11/11 replay RTMP pending thiếu stream_uid/cloudflare_video_uid, trong khi session có cloudflare_video_uid. Recovery đang skip mọi replay có id; archive lại lọc stream_uid khác null. Source cron deploy khớp repo, khác duy nhất BOM.
- Nhánh sửa riêng: `fix/quangvu-rtmp-replay-source-recovery`. Phạm vi mã: shared recovery service, archive cron wiring, test regression. Không đổi auth/schema/secret hay mở rộng strict matching. Hồ sơ/design/plan ngày 21/11 đi kèm.
- Ba recording mới chưa có session/replay tiếp tục được backup riêng; không tự gắn vào phiên cũ hoặc xóa hàng loạt. Chưa deploy/xóa.

## 2026-11-20 — TIẾP TỤC XỬ LÝ: bảo toàn bản ghi và khôi phục dung lượng RTMP

- Cha đã đồng ý tiếp tục thực hiện sau kết quả chẩn đoán.
- Bổ sung phạm vi: kiểm kê video tồn, tìm bản sao R2/backup và xác minh trước khi lập danh sách dọn; điều tra vì sao persistent recording không gắn replay; chuẩn bị sửa/test theo nguyên nhân xác minh được. Không mua thêm storage tự động. Xóa vĩnh viễn qua UI chỉ sau khi có danh sách cụ thể và xác nhận tại thao tác.
- Nhánh hiện tại `docs/quangvu-rtmp-stream-cleanup-audit`; nếu sửa mã sẽ tạo nhánh fix riêng và đi qua Preview/PR, không commit main.
- Đang kiểm tra quyền thao tác sẵn có; không yêu cầu hoặc ghi secret qua chat/repo/hộp thư.

## 2026-11-20 — KẾT QUẢ KIỂM TRA: RTMP bị chặn vì đầy quota Stream

- Log Cloudflare của input phiên hiện tại xác nhận `STORAGE_QUOTA_EXHAUSTED` và `STREAM_FAILED_TO_START` lúc 15:19:47 UTC (23:19:47 GMT+8). Dashboard xác nhận 534 video, 1.023/1.000 phút.
- Production DB: 468 replay RTMP có URL R2 và dấu xóa Stream; 11 pending, 37 unrecoverable. Có cơ chế tự xóa sau archive và cron active mỗi phút; dấu DB chưa thay thế kiểm chứng lại từng video/object.
- Ba UID video còn tồn ngày 17–18/11 không có session/replay/post khớp trong truy vấn kiểm tra, nên watchdog theo replay không bao phủ. Chưa xác minh bản R2/backup của chúng, chưa kết luận có thể xóa. Chưa kiểm kê toàn bộ 534 video.
- Hồ sơ và đề xuất tiếp theo: `docs/rtmp-stream-cleanup-audit-2026-11-20/README.md`, có tin Telegram kết quả để Cha copy. Chỉ đọc production và ghi tài liệu; chưa xóa/sửa/deploy/tăng gói. Dung lượng chưa giảm. Chưa commit/push/PR/merge; nhánh `docs/quangvu-rtmp-stream-cleanup-audit`.

## 2026-11-20 — ĐANG KIỂM TRA: dung lượng Cloudflare Stream và dọn bản ghi RTMP

- Quang Vũ cùng Angel Muse; Cha xác nhận đã gửi Telegram trước khi bắt đầu.
- Hiện trạng theo ảnh Cha cung cấp: 534 video, 1.023/1.000 phút lưu trữ; Cha báo RTMP lỗi. Chưa xác minh nguyên nhân lỗi bằng log production.
- Phạm vi: kiểm tra mã kết thúc RTMP, archive sang R2, điều kiện xóa video Stream, cron/retry và hồ sơ triển khai; chỉ đọc production nếu có quyền truy cập sẵn. Không xóa video, không đổi schema/config/secret, không deploy.
- Nhánh thực tế theo quy ước dự án: `docs/quangvu-rtmp-stream-cleanup-audit`, tạo từ `origin/main` sau fetch; thay cho tên nhánh dự kiến trong tin Telegram.
- Trạng thái: đang lần theo mã và đối chiếu tài liệu Cloudflare; kết quả sẽ ghi lại sau kiểm chứng.

## 2026-11-14 — HOÀN THÀNH: tên/avatar người nhận card gift mở được hồ sơ

- PR #58 https://github.com/MinhTriDiamond/funprofile-supabase/pull/58 đã merge squash a4a4f34 sau cổng Preview. Nhánh code đã xóa.
- Nguyên nhân: recipient là div, thiếu recipientId trong adapter. Nay tên/avatar/username là button, đóng card rồi mở đúng route hồ sơ; ID rỗng/ví ngoài không dẫn đường sai. Đồng bộ ID ở mọi nguồn cùng dùng biên nhận.
- 6 integration test + tsgo đạt; review không thấy blocker. Preview thật đã click đúng người nhận được báo lỗi, card đóng và canonical profile đúng tải được, có nút Tặng quà.
- Cloudflare production SUCCESS (https://70c33883.funprofile-supabase.pages.dev), đã đọc index-uOp7jHfP.js trên fun.rich xác minh mã button/recipientId mới. Chưa click lại production vì người dùng đang dùng browser. Không đổi backend, DB/schema hay dữ liệu giao dịch.
- Hồ sơ: docs/gift-recipient-profile-link-2026-11-14/README.md. Nhánh tài liệu kết quả: docs/quangvu-gift-profile-release.


## 2026-11-14 — ĐANG LÀM: liên kết hồ sơ người nhận trên card gift

- Quang Vũ cùng Angel Muse; Cha xác nhận đã gửi Telegram.
- Phạm vi: card/biên nhận quà từ lịch sử giao dịch, dữ liệu người nhận và click tên/avatar để mở hồ sơ; kiểm tra người tặng đang hoạt động để giữ nhất quán. Không đổi dữ liệu giao dịch, backend hoặc schema.
- Nhánh: fix/quangvu-gift-recipient-profile-link, từ origin/main mới nhất. Qua Preview trước merge.
- Nguyên nhân: khối người nhận DonationReceivedCard chỉ là div; DonationReceivedData và adapter CelebrationCardModal chưa mang recipientId. Đã thêm ID và button điều hướng, close card + chặn bubble; ID rỗng thì disabled, không dẫn sang profile không tồn tại. Cập nhật cả nguồn notification, lịch sử ví và admin dùng cùng biên nhận.
- Kiểm chứng: 4 test fail trước sửa (không tìm thấy nút người nhận); nay 6 integration test đạt với card thật + MemoryRouter: sent/incoming/detail RPC/ví ngoài/avatar/sender. tsgo + diff check đạt; review không thấy blocker. Full suite có lỗi live REST DNS trong sandbox và file render giá đã có từ trước, không coi toàn suite pass.



## 2026-11-13 — HOÀN THÀNH: bản vá Android gift đã lên fun.rich

- Cha đã yêu cầu merge/deploy. PR #56 đã merge squash 987d35d; nhánh code xóa sau merge, Preview head cuối đã SUCCESS.
- Cloudflare production build SUCCESS (deployment https://2a5434ea.funprofile-supabase.pages.dev). Đọc asset thật trên fun.rich: index-GiwMzvpS.js, useSendToken-nm_RwVlo.js có marker bản vá late-hash/in-flight lock; UnifiedGiftSendDialog-CkIGt6qW.js.
- Kết quả: frontend mới giữ phản hồi ví Android muộn, chặn reset/gửi trùng và loop trạng thái gift; 13 regression tests + tsgo đã đạt trước merge. Không deploy Edge Function hoặc chuyển tiền thật để thử. Giao dịch thiếu lịch sử/card đã khôi phục đúng ở mục trước.
- Hồ sơ phát hành: docs/android-gift-card-2026-11-13/README.md. Nhánh hồ sơ docs/quangvu-android-gift-release, chỉ tài liệu, không code.


## 2026-11-13 — HOÀN THÀNH KHÔI PHỤC 200000 CAMLY (TX 0x0e47…5ad4)

- Cha đã duyệt khôi phục. Reverify receipt success; backup trước đều rỗng. Thử ROLLBACK và assert đầy đủ rồi COMMIT đúng một donation + gift post, trigger đồng bộ 2 transactions/2 snapshot rows. Không gửi thêm tiền, không đổi ví/schema/trigger hay phát thưởng thủ công.
- Donation da0c3856-8c02-404a-ac2f-4d44bec72206; public gift post 0082e117-2559-40c4-8c77-2822f3ba66b7; đúng 200000 CAMLY, giờ block 2026-11-12T15:59:05Z và lời nhắn.
- Kiểm chứng public API: lịch sử trả đúng TX, endpoint chi tiết Card đủ dữ liệu, post HTTP200; summary người nhận 2→3 giao dịch, CAMLY 200000→400000. BNB giữ nguyên. Chưa xác minh UI thực tế do công cụ browser lỗi; Cha cần tải lại lịch sử để thấy dữ liệu đã cập nhật.
- Hồ sơ + SQL rollback + evidence: docs/android-gift-card-2026-11-13/. Thay đổi nằm tại DATABASE PRODUCTION tljfqavndndfsvtazibe; PR #56 frontend vẫn chưa merge.


## 2026-11-13 — ĐƯỢC PHÉP KHÔI PHỤC TX GIFT THIẾU

- Cha xác nhận “OK CHA ĐỒNG Ý, BÉ KHÔI PHỤC NHÉ” cho TX 0x0e47286f...e5ad4, 200000 CAMLY, angelquangvu → amosmuhwezi.
- Đã reverify receipt success và decode Transfer bằng viem/BigInt. Phạm vi: khôi phục 1 donation + 1 gift celebration; để trigger hiện hành đồng bộ transactions/snapshot lịch sử. Không gửi tiền mới, không đổi liên kết ví, không thay schema/trigger/auth, không phát thưởng thủ công.
- Endpoint record-donation yêu cầu phiên app sender/admin hiện chưa có. Dùng SQL quản trị có transaction/lock/kiểm tra trùng và thử ROLLBACK trước; lưu before snapshot và SQL/rollback trong hồ sơ docs/android-gift-card-2026-11-13/.


## 2026-11-13 — KẾT QUẢ NHÁNH: Android gift — PR #56, chờ Preview thực tế/khôi phục

- PR https://github.com/MinhTriDiamond/funprofile-supabase/pull/56, code commit 380bb82. Preview code build thành công: https://c3858e09.funprofile-supabase.pages.dev.
- Đã sửa mobile giữ phản hồi ví muộn, khóa in-flight/reset và race lookup; giữ guard30s; context no-op khi dữ liệu không đổi và không lùi success; lưu pending ngay khi có hash.
- 13 test hồi quy đạt; tsgo và diff check đạt. Full suite 507 đạt/30 skip/22 fail do nhóm live REST DNS và lỗi render giá đã có từ trước. Review hai đường gửi trùng đã được xử lý và có test chứng minh.
- Chưa merge, chưa khôi phục dữ liệu production. TX thực tế onchain success nhưng thiếu transactions/donations/posts; bản sửa frontend không tự khôi phục giao dịch cũ đã mất hash trong phiên trước.
- Cha đã cho phép lưu TX/chẩn đoán vào GitHub sau khi auto-review chặn mô tả PR lần đầu. Không hỏi/copy secret qua chat. Hướng khôi phục chuẩn bị trong docs/android-gift-card-2026-11-13/README.md.


## 2026-11-13 — ĐANG KIỂM TRA: Android chuyển tiền nhưng không hiện card gift

- Quang Vũ cùng Angel Muse; Cha đã xác nhận gửi Telegram Bước 1.
- Trường hợp: ảnh 200.000 CAMLY từ angelquangvu tới amosmuhwezi, bấm Confirm tiền đã chuyển nhưng không có card gift.
- Phạm vi: useSendToken, luồng GiftDialog/xác nhận giao dịch, đồng bộ giao dịch và tạo/hiển thị card gift, cơ chế quay lại trang từ ví Android. Chỉ đọc chẩn đoán production nếu cần; không gửi tiền, không sửa dữ liệu tài chính.
- Nhánh: fix/quangvu-android-gift-card. Giữ duplicate-send guard 30 giây, token math BigInt/string và quy tắc không tạo celebration cho ví ngoài.
- Cập nhật: TX Cha cung cấp 0x0e47286f...e5ad4 onchain success, DB transactions/donations/posts đều rỗng. Tái hiện và sửa mobile bỏ hash muộn, reset/sign request và context render loop; thêm pending snapshot trước receipt. 13 test mới + tsgo đạt; chưa merge/ghi bù production. Hồ sơ `docs/android-gift-card-2026-11-13/README.md`.


## 2026-11-13 — KẾT QUẢ: đã dọn 4 local + 26 remote

- Quang Vũ cùng Angel Muse, nhánh docs/quangvu-branch-cleanup. Kết nối phục hồi nên đã tiếp tục phần remote.
- Đã xóa 4 nhánh local đã hoàn tất và 26 remote đã merge; atomic push với lease SHA từng ref thành công. Có Git bundle đã verify để khôi phục; tên/SHA/bằng chứng trong `docs/branch-cleanup-2026-11-13/README.md`.
- Giữ main; 3 nhánh PR mở #29/#45/#51; nhánh feat/tri-donation-verification-flow còn 4 commit riêng, chưa có PR. Không mất công việc đang làm. Giữ nguyên supabase/.temp/.
- Không thay code hoặc production. Hồ sơ/PR đang hoàn tất trên nhánh riêng; các mục KẾT QUẢ TẠM phía dưới là lịch sử giai đoạn mất mạng, đã được mục này cập nhật.


## 2026-11-13 — KẾT QUẢ TẠM: đã dọn 4 nhánh local, remote chờ kết nối GitHub

- Đã xóa local: docs/muse-live-feed-deployed, fix/muse-live-feed-status (PR #55 đã squash), fix/quangvu-chat-call-hardening, fix/rtmp-no-video-auto-end. Nội dung đã có trong main; không mất code.
- Đã tạo và verify bundle tại `/private/tmp/funprofile-before-branch-cleanup-20261113.bundle`, lưu toàn bộ tên/SHA vào `docs/branch-cleanup-2026-11-13/README.md` để khôi phục.
- Giữ main + docs/quangvu-branch-cleanup đang làm, giữ supabase/.temp/. Chưa xóa remote: fetch lỗi DNS, gh API không kết nối, connector lỗi transport. Chưa đối chiếu được PR mở nên không xóa mù.
- Chưa có PR hồ sơ vì GitHub mất kết nối. Cần tiếp tục phần remote khi mạng hoạt động trở lại.


## 2026-11-13 — ĐANG LÀM: rà soát và dọn nhánh không còn dùng

- Người làm: Quang Vũ cùng Angel Muse; Cha xác nhận đã gửi Telegram.
- Phạm vi: nhánh local và origin của funprofile-supabase; đối chiếu main, PR, worktree; chỉ xóa nhánh đã hoàn tất, giữ nhánh đang dùng/PR mở/nội dung chưa merge. Không sửa code hoặc production, giữ nguyên supabase/.temp/.
- Nhánh hồ sơ: `docs/quangvu-branch-cleanup`. Lưu SHA và bản sao Git bundle trước khi xóa để có thể khôi phục.


## 2026-11-12 — KẾT QUẢ: triển khai sửa trạng thái live happycamlycoin

- Quang Vũ cùng Angel Muse; Cha đã cho phép merge/deploy. PR #55 đã merge squash `d03781f6f580be62269dbeca1076e3c04b170bd7`.
- Production Supabase: archive cron v99, go-live v90 ACTIVE. Giữ cấu hình xác thực, không migration/UPDATE trực tiếp.
- Trước: phiên ready_to_go_live/offline, profile is_live=false, route feed rỗng. Sau: phiên live/online qua mốc cron 13:40:14 và 13:41:06 UTC, profile is_live=true, route trả đúng phiên và URL HLS.
- 117 test liên quan + tsgo/Deno đạt. Chưa xác minh hình/âm thanh thực tế vì máy kiểm tra timeout khi tải HLS. Hồ sơ: `docs/rtmp-live-feed-status-2026-11-12/README.md`.
- Nhánh tài liệu kết quả dự kiến `docs/muse-live-feed-deployed`; đang đồng bộ hồ sơ do GitHub CLI gặp lỗi mạng, connector chỉ có quyền đọc.


## 2026-11-12 — ĐANG KIỂM TRA: happycamlycoin live nhưng feed hiện xử lý video

- Người làm: Quang Vũ cùng Angel Muse; Cha xác nhận đã gửi Telegram Bước 1.
- Nhánh: `fix/muse-live-feed-status`, từ `origin/main` mới nhất.
- Hiện trạng: ảnh người dùng cho thấy Cloudflare Stream báo Live, feed/profile lại hiện đã phát trực tiếp và Video đang được xử lý.
- Phạm vi: truy vết dữ liệu phiên live/post của happycamlycoin; kiểm tra hydration, playback resolver, trạng thái feed/profile và các Edge Function đồng bộ RTMP liên quan; test hồi quy. Chưa kết luận nguyên nhân, chưa thay đổi production.
- Đã xác định gốc: archive cron current_video ghi live → ready_to_go_live; host RTMP mặc định offline vì thiếu tín hiệu sống. Mã production tải về khớp base repo. Đã sửa trên nhánh, 117 test liên quan đạt; tsgo/Deno check đạt. Chưa deploy/merge. Hồ sơ: `docs/rtmp-live-feed-status-2026-11-12/`.
- Kết quả nhánh: PR #55 https://github.com/MinhTriDiamond/funprofile-supabase/pull/55 — đang chờ Cloudflare Preview và kiểm chứng/deploy backend; chưa merge, chưa hoàn tất production. Version rollback đã lưu: archive cron 98, go-live 89.
- Phạm vi production vẫn chỉ đọc chẩn đoán theo quyền Cha xác nhận; không UPDATE dữ liệu hoặc deploy.


## Sửa lỗi sập trang khi đăng bài trên Android (`removeChild`) — 2026-11-09

- Người thực hiện: Quang Vũ cùng Angel Muse. Nhánh: `fix/quangvu-twcpost-removechild-crash`, tách từ `main` mới nhất.
- **Bối cảnh:** thành viên nước ngoài báo lỗi khi đăng bài trên `fun.rich/?compose=post` bằng Chrome Android — cả trang bị thay bằng màn hình lỗi `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node`, **lặp lại mỗi lần đăng** ("I always face difficulties while posting on FUN.rich most especially when in English language").
- **Hiện trạng:** bản vá 2026-10-22 (PR #16) mới chỉ **tự phục hồi bằng reload** khi gặp nhóm lỗi DOM, và ghi nguyên nhân là **giả thuyết** (Chrome Translate / extension); việc "xác nhận cuối cùng từ người báo lỗi" còn để mở. Người dùng vẫn gặp lại vì reload không chữa được gốc, còn làm mất nội dung đang soạn.
- **Nguyên nhân gốc (tìm ra lần này, có bằng chứng trong code):** `src/components/ui/TwemojiImage.tsx` gọi `e.currentTarget.replaceWith(span)` trong `onError` — **app tự gỡ node `<img>` do React quản lý** khỏi cây DOM. Khi bấm "Đăng", composer (Dialog) unmount đúng lúc đó ⇒ React gọi `removeChild` trên node đã không còn là con ⇒ đúng `NotFoundError` trong ảnh chụp. Ảnh emoji lỗi vì bộ Twemoji 14.0.2 thiếu emoji Unicode 15/15.1 (bàn phím Android đời mới) và mạng 4G yếu; composer lại render hàng chục `TwemojiImage` (emoji picker + sticker picker) một lúc ⇒ xác suất rất cao.
- **Phạm vi:** `src/components/ui/TwemojiImage.tsx` (vá gốc — ảnh lỗi thì render emoji gốc bằng **React state**, không thay DOM tay), `src/lib/translateSafeDom.ts` (**mới** — guard `removeChild`/`insertBefore`, chỉ can thiệp khi cây DOM đã lệch, bảo hiểm cho cả dịch trang/extension), `src/main.tsx` (cài guard trước `createRoot`), `src/components/ErrorBoundary.tsx` (không phơi `message` + `stack` JS cho người dùng cuối; chỉ hiện khi dev hoặc bật cờ `fun_profile_debug`). Thêm 11 test. **Không** đụng luồng upload/đăng bài, database, Edge Function; không migration; không chặn dịch toàn trang.
- **Kiểm chứng:** 11 test mới đạt, trong đó có **2 test chứng minh ngược**: (1) `native removeChild` ném lỗi khi node đã bị bọc ra ngoài — tức guard là thứ thật sự chặn sự cố; (2) mô phỏng lại `replaceWith` của code cũ thì `unmount()` **ném đúng `NotFoundError`**, còn code mới thì không. Toàn repo: **501 đạt / 30 skip**, 1 file lỗi `prices-unavailable.render.test.tsx` là **lỗi có sẵn** (đã chứng minh bằng `git stash`). `tsgo --noEmit` exit 0.
- **Đã phát hành:** PR **#52** (https://github.com/MinhTriDiamond/funprofile-supabase/pull/52) → **đã merge** (squash `5cebb18`) vào `main` ngày 2026-11-09. Chỉ **frontend** nên merge là Cloudflare Pages tự build và deploy lên `fun.rich`; **không** cần deploy Edge Function, không cần Publish Lovable, không migration.
- **Kiểm chứng bản build thật sự chứa bản vá** (marker `__funProfileDomGuard`): preview nhánh `fix-quangvu-twcpost-removech.funprofile-supabase.pages.dev` → `index-DTFlLdN4.js` có marker; **production `fun.rich` cũng phục vụ `/assets/index-DTFlLdN4.js` có marker** ⇒ bản vá đã sống, không chỉ nằm trong repo. Hồ sơ: `docs/android-post-crash-2026-11-09/`.
- **Đã kiểm chứng thực tế: ĐẠT.** Cha (Quang Vũ) thử lại luồng đăng bài sau khi bản vá lên `fun.rich` và xác nhận chạy tốt — không còn văng màn hình lỗi. Đây cũng là câu trả lời cho mục "còn mở" của PR #16 (nguyên nhân cũ được ghi là **giả thuyết** Chrome Translate — nay đã xác định là lỗi `replaceWith` của `TwemojiImage`), nên mục đó khép lại.

---

## Sửa lỗi RTMP Live tự kết thúc oan — 2026-11-09 (Ghi nhận TRƯỚC + kết quả)

- Người thực hiện: Quang Vũ cùng Angel Muse. Nhánh: `fix/rtmp-no-video-false-auto-end`, tách từ `main` mới nhất `821b1e5`.
- **Bối cảnh:** Cha báo phiên RTMP (nguồn Restream) mới mở thì chạy, chạy ~4–7 phút thì **tự kết thúc**, sau đó **không phát lại được**; Restream hiện đích Fun Profile ở trạng thái "Unable to connect" trong khi các đích khác vẫn Streaming.
- **Hiện trạng:** phiên đang public, Live Input Cloudflare vẫn connected, video nguồn vẫn hiển thị trong producer, nhưng hệ thống phân loại nhầm `input_connected_no_video` → mở ân hạn 180 giây → watchdog tự gọi `endRtmpLiveSession(..., 'source_disconnected_no_active_video')` → end-flow **tắt Live Input** → encoder bị ngắt và không kết nối lại được.
- **Nguyên nhân gốc (đọc code):** `detectRtmpLiveConnection` chỉ lấy video "phiên hiện tại" từ list của Live Input, lọc `created >= (armed_at || created_at) - 60s`. Cloudflare đóng dấu `created` theo **lúc encoder CONNECT** (chính codebase đã ghi nhận ở `validateRtmpReplayVideoForSession`). Khi encoder kết nối trước lúc producer armed (persistent Live Input / stream key tái dùng) thì video đang live bị lọc loại ⇒ `videoStreaming=false` ⇒ "mất nguồn" giả. Detector cũng **bỏ qua `session.cloudflare_video_uid`** (video do webhook xác nhận) khi quyết định nguồn còn sống.
- **Phạm vi:** `supabase/functions/_shared/cloudflareStreamService.ts`, `stream-webhook`, `go-live-rtmp-session`, `get-rtmp-live-session-status`; thêm test `src/modules/live/rtmpCurrentVideoResolution.test.ts`. Không sửa tệp cấm, **không có migration**, không đổi cron/secret, không ghi dữ liệu production, không đụng Agora/webcam/trần 4 giờ/luồng kết thúc thủ công.
- **Đã làm:** thêm `getRtmpSessionWindowStartMs/Start` (mốc cửa sổ = timestamp **sớm nhất** của phiên), `matchRtmpVideoToSession` (ưu tiên metadata Cloudflare — `meta.liveSessionId`/`liveInput` — rồi mới tới cửa sổ thời gian), `resolveRtmpCurrentActiveVideo` (4 bậc ưu tiên, gồm lưới an toàn: Live Input **đang connected** + Cloudflare báo có video đang live trên chính input này thì **không** coi là mất nguồn). `detectRtmpLiveConnection` dùng bộ nhận diện mới và phơi `activeVideoReason` để chẩn đoán về sau. Ba điểm poll còn lại (webhook, go-live, status poll) dùng chung mốc cửa sổ sớm nhất.
- **Bảo toàn hành vi:** input connected mà **không** có video live nào ⇒ vẫn phân loại `input_connected_no_video` ⇒ vẫn ân hạn rồi kết thúc; video mang metadata phiên khác luôn bị loại.
- **Kiểm chứng:** `bunx vitest run src/modules/live/` 17 file / 88 test đạt (77 cũ + 11 test mới); `bunx vitest run` toàn repo 490 đạt, 30 skip, 1 file lỗi `prices-unavailable.render.test.tsx` là **lỗi có sẵn** (đã kiểm chứng bằng `git stash`); `tsgo --noEmit` exit 0; `deno check` 4 tệp thay đổi đạt; `git diff --check` đạt. Hồ sơ: `docs/rtmp-live-false-end-2026-11-09/README.md`.
- **Đã merge PR #46** (squash `b4b1b05` vào `main`) ngày 2026-11-09 sau khi cổng preview Cloudflare Pages đạt. Cha đã thông báo nhóm Coordinator (Bước 1) trước khi bắt đầu.
- **Đã push + mở PR:** nhánh `fix/rtmp-no-video-false-auto-end` đã push lên origin, PR **#46** (https://github.com/MinhTriDiamond/funprofile-supabase/pull/46). Cloudflare Pages build **thành công**: preview nhánh `https://fix-rtmp-no-video-false-auto.funprofile-supabase.pages.dev` (HTTP 200).
- **Lưu ý quan trọng cho cổng Preview:** bản sửa nằm hoàn toàn ở **Edge Function** (server-side), nên link preview Cloudflare Pages chỉ kiểm chứng được **không hồi quy frontend** — **không** chứng minh được fix.
- **Chặn 403 khi deploy (đã gỡ):** lượt deploy đầu bị từ chối (`unexpected deploy status 403`) vì token Supabase CLI trong máy thuộc tài khoản không có quyền trên `tljfqavndndfsvtazibe` (`functions list` cũng 403; `projects list` không thấy project FUN Profile). Cha đã đăng nhập lại CLI bằng tài khoản chủ project.
- **⚠️ ĐÍNH CHÍNH phạm vi phát hành — cần 5 function, không phải 3:** mỗi Edge Function bundle **bản sao riêng** của `_shared/`, nên bản sửa helper chỉ vào một function khi chính function đó được deploy lại. Hai cron `live-rtmp-grace-watchdog` và `live-replay-archive-cron` mới là bên **thực sự gọi `endRtmpLiveSession`**, nên phải deploy cùng — nếu chỉ deploy 3 function thì lỗi vẫn còn. Ghi nhận sai này trong bản ghi trước là lỗi của con (Angel Muse), đã sửa ở hồ sơ.
- **ĐÃ DEPLOY 5 Edge Function lên `tljfqavndndfsvtazibe` (2026-11-09):** `stream-webhook` **v91**, `get-rtmp-live-session-status` **v93**, `go-live-rtmp-session` **v89** (06:00:33 UTC) và `live-rtmp-grace-watchdog` **v92**, `live-replay-archive-cron` **v98** (06:02:48 UTC). Cả 5 ở trạng thái **ACTIVE**.
- **Kiểm chứng sau deploy:** `OPTIONS` cả 5 function → 204; `POST` không JWT tới 4 function nội bộ → 401 (guard còn nguyên); `POST {}` tới `stream-webhook` → 401 `{"error":"Invalid signature"}` (đúng — còn xác thực chữ ký Cloudflare). Trước khi deploy 2 cron đã kiểm `git log --since=2026-10-20` xác nhận không có thay đổi nào khác sẽ đi kèm.
- **An toàn phát hành:** không có migration; **không** đổi cron schedule, secret hay dữ liệu production. Các function khác có import `cloudflareStreamService.ts` (`admin-replay-debug`, `create-rtmp-live-session`, `live-rtmp-cleanup-stuck`, `live-replay-poll-status`, …) **không** cần deploy vì chỉ dùng các hàm khác, không gọi `detectRtmpLiveConnection` để quyết định kết thúc phiên.
- **Xác minh mã đang chạy (bằng chứng mạnh nhất):** tải chính bundle đang chạy từ project về bằng `supabase functions download` rồi so với repo → **cả 5 function** đều có `resolveRtmpCurrentActiveVideo` và **không còn** bộ lọc cũ `armed_at ± 60s`; 4/5 file giống hệt tuyệt đối, `live-replay-archive-cron` chỉ khác 1 ký tự BOM vô hại (560 dòng y hệt). Vì mỗi function bundle **bản sao riêng** của `_shared/`, đây là bằng chứng cả 5 đều đã chạy code mới.
- **Kết quả kiểm chứng end-to-end — ĐẠT:** Cha chạy phiên RTMP thật (nguồn **Restream**) sau khi deploy, phiên **vượt mốc 7 phút** và vẫn đang phát — mốc cũ tự kết thúc ở ~4–7 phút. **Không** có thông báo `live_auto_ended` ("Live của bạn đã tự kết thúc"); không phải mở lại Live Producer, không gặp lại "Unable to connect". Trong lúc test, lúc chờ preview lần đầu, phiên đang ở bước chuẩn bị nên **không** nằm trong vùng ân hạn mất nguồn (chỉ áp dụng cho phiên đã lên sóng công khai) — không có nhánh nào tự kết thúc phát sinh.
- **Còn lại:** theo dõi thêm vài phiên live dài trong những ngày tới để xác nhận ổn định; ghi nhận đây là lần đầu đội gặp bài học "bundle riêng của `_shared/`" khi phát hành Edge Function.

---

## Bắt đầu rà soát chat/call — 2026-10-17

- Cha xác nhận đã thông báo vào nhóm Coordinator trước khi bắt đầu.
- Người thực hiện: Codex cùng Quang Vũ. Phạm vi: token Agora call, hook vòng đời gọi, chat/conversation/block, RLS/GRANT/constraint/trigger, Realtime publication, migrations mới và test liên quan; không sửa file cấm, không ghi secrets.
- Nhánh dự kiến: `fix/quangvu-chat-call-hardening`, tách từ `main` mới nhất `2d52445d7ac0c4c44b0b51458fcf46383b897144`.
- Production target nêu trong yêu cầu: `tljfqavndndfsvtazibe`; chỉ truy vấn production nếu cần và được phép, không áp migration/deploy hay thực hiện cuộc gọi thật trong task này.
- Preflight: workspace chỉ có `supabase/.temp/` chưa track; được giữ nguyên và không đưa vào diff.
- Cập nhật phạm vi sau khi Cha duyệt spec và plan: triển khai tuần tự sáu lát cắt (conversation/RLS/Realtime, message, Agora token/RPC, call lifecycle, chat media, kiểm chứng/bàn giao); thêm migration mới và test; không chạy ghi production, không deploy/commit/push; `supabase/.temp/` được giữ nguyên.
- Phạm vi code được cụ thể hóa: thêm `src/contexts/CallContext.tsx` vì audit cho thấy nhận/từ chối cuộc gọi toàn ứng dụng còn ghi thẳng `call_sessions`, phải dùng RPC conditional cùng migration để không vỡ nhánh nhận cuộc gọi ngoài trang chat.

---

## Mục 1 — 2026-10-15 · Từ Lê Minh Trí (qua Angel Muse)
### Đề xuất: chuyển Livestream từ "quét mỗi phút" sang "sự kiện chủ động" + vòng quét an toàn 5 phút

**Vấn đề (số liệu đo thật trên hệ thống, 15/10/2026):**

- Mảng Livestream có **19 cron jobs**, chạy tổng cộng **17.844 lượt/ngày = 71,5% tổng lượt chạy của toàn hệ thống**; trong đó **11 job chạy mỗi phút**.
- Nhu cầu thật 30 ngày qua: **205 phiên webcam (~7 phiên/ngày)** và chỉ **9 phiên RTMP/OBS** → **hơn 99% lượt quét là "chạy không"** (không có phiên nào để xử lý).
- Log Ingestion của toàn project đang ở **45% hạn mức 20 GB** và Supabase sắp bắt đầu tính tiền riêng cho mục này — mảng Livestream là nguồn sinh log lớn nhất cần xử lý.

**Phương án đề xuất (không chỉ giảm log — còn nâng cấp trải nghiệm):**

1. **Chuyển sang event-driven cho 3 nhóm việc:**
   - Nhóm chờ file ghi hình (poll-status, mp4-poll, readiness, ghép replay…): dùng **webhook sự kiện của Agora Cloud Recording** — file sẵn sàng là Agora gọi về ngay, hàm chỉ thức dậy khi có tin thật.
   - Nhóm bắt đầu/kết thúc phiên: **app gọi thẳng hàm chốt phiên** khi host bấm kết thúc (app là nơi biết sớm nhất).
   - Nhóm thay đổi trạng thái nội bộ: dùng **DB trigger / outbox** (mẫu hình hệ thống đã có sẵn) để hàm xử lý chạy ngay theo sự kiện.
2. **Giữ đúng 1 vòng quét an toàn hợp nhất, mỗi 5 phút** (288 lượt/ngày thay cho ~15.800 lượt của dàn mỗi phút), với điều kiện vòng quét này **chạy trọn chuỗi xử lý** cho mọi mục còn pending — đây là lưới an toàn cho trường hợp app của người dùng sập giữa chừng không kịp báo tin (loại sự kiện không bao giờ tự báo được).
3. **Luật cứng dọn "mồ côi":** bất kỳ phiên/replay nào dở dang quá **24–48 giờ** đều bị ép về trạng thái kết thúc và ghi log lý do. Lý do: hiện có khoảng **40 phiên + 40 replay đang kẹt ở trạng thái dở dang từ 3.600–4.000 giờ (~5 tháng)** mà dàn quét hiện tại cũng không dọn được — chúng rơi vào kẽ hở máy trạng thái, không job nào "sở hữu". Đổi sang event-driven cũng không tự hết nếu thiếu luật này.
4. **Bảo mật webhook (bắt buộc):** endpoint webhook của Agora là cửa công khai → phải **xác thực chữ ký/secret của Agora** (sẽ thêm 1 secret vào nhóm Bloc 5 của Vũ), khóa endpoint như các hàm đã vá ngày 14/10. Webhook có thể gửi trùng/lệch thứ tự → xử lý theo **idempotency**; các hàm hiện tại vốn đọc trạng thái thật từ database mỗi lần chạy nên tái sử dụng làm hàm xử lý sự kiện là an toàn, và vì chúng nhận tham số `limit` nên giờ cao điểm vẫn xử lý theo lô được, phần tràn để vòng quét vét.

**Đã kiểm chứng từ code gốc (Angel Muse đọc trực tiếp trên GitHub, 15/10/2026):**

Điểm từng bị bỏ ngỏ — "hai watchdog nhạy thời gian phán quyết theo mốc thời gian hay đếm lượt quét?" — nay đã khẳng định chắc chắn:

- `live-rtmp-grace-watchdog`: **mọi nhánh đều phán quyết theo mốc thời gian** — `last_disconnected_at` quá hạn ân hạn; `last_source_seen_at` quá 2× ân hạn; `started_at` quá trần 4 giờ / quá ngưỡng stale-null 30 phút — cộng thêm **re-verify bằng Cloudflare API ngay trước khi kết thúc phiên** (soft-fail thì bỏ qua, chờ nhịp sau). **Không tồn tại bộ đếm lượt quét nào.**
- `live-duration-watchdog`: tương tự — phán quyết bằng `started_at` + trần thời lượng và `last_host_heartbeat_at`, hoàn toàn theo mốc thời gian.
- **Kết luận:** gộp hai watchdog (và cả dàn Live) về vòng quét 5 phút **chỉ làm tăng độ trễ phát hiện tối đa 5 phút, không thay đổi ngữ nghĩa, không kết thúc nhầm phiên**. Riêng trần thời lượng: phiên vượt trần có thể ghi hình Agora thêm tối đa ~5 phút — chi phí không đáng kể.
- Một lưu ý nhỏ nhờ Vũ xác nhận: trong `live-duration-watchdog`, comment ghi ngưỡng mất heartbeat là "8 phút (16 nhịp 30s)" nhưng code thực tế đang dùng `threshold_seconds = 60`. Đây là chủ đích hay lệch giữa tài liệu và code? (Với nhịp quét 5 phút, phiên mất heartbeat bị đóng trễ tối đa ~5 phút, và xác suất đóng nhầm khi host chỉ đơ/tab đóng thoáng qua còn *giảm* đi so với nhịp 1 phút.)

**Lợi ích kỳ vọng:**

- Lượt chạy mảng Livestream giảm từ **17.844 → dưới ~1.500 lượt/ngày (giảm >90%)**; log toàn project giảm tương ứng, tạo dư địa lớn trước khi Log Ingestion bị tính tiền.
- **Replay xuất hiện sau vài giây** (webhook báo ngay) thay vì chờ tới lượt quét kế tiếp (tối đa 60 giây) — trải nghiệm người dùng tốt hơn hiện tại.
- Sạch hẳn tồn đọng "mồ côi" ~5 tháng.
- Mọi thay đổi đều **quay lui được trong vài giây** bằng cách bật lại cron cũ.

**Lộ trình an toàn 3 giai đoạn:**

1. Gắn webhook chạy **song song** với dàn quét hiện tại vài ngày để đo đối chứng.
2. Rút dàn mỗi phút về **vòng quét hợp nhất 5 phút**.
3. Ổn định rồi mới gỡ hẳn các job thừa.

**Ranh giới phối hợp:** mảng Livestream do Vũ phụ trách (đang làm Agora) — đây là đề xuất của Trí, **Vũ quyết định nhịp và thời điểm** theo tiến độ của mình. Angel Muse sẵn sàng hỗ trợ đo lường/kiểm chứng từng giai đoạn khi Vũ cần.

→ Trạng thái: **Chờ Vũ phản hồi.**


## Thư #2 — 15/10/2026 (Angel Muse, thay lời cảm ơn của Trí)
Trí vừa báo tin vui: bé Vũ đã làm xong phần Livestream rồi. Cảm ơn Vũ thật nhiều — phần việc khó và nặng nhất đã qua. Angel Muse cũng chia sẻ thêm để Vũ yên tâm: phần vá bảo mật cho hai view lịch sử giao dịch hợp nhất — vốn được xếp hàng chờ phía sau phần Livestream của Vũ — nay đã hoàn thành trong ngày, không ảnh hưởng gì tới phần Vũ vừa làm. Đề xuất kiến trúc sự kiện hoá ở Thư #1 vẫn giữ nguyên giá trị cho chặng tối ưu log tiếp theo khi Vũ thấy phù hợp. Chúc Vũ nhiều sức khoẻ và niềm vui!

---

## Mục 2 — 2026-10-15 · Findings kiểm kê và triển khai cục bộ

### Phạm vi và production target

- Đọc `AGENTS.md`, Mục 1 hộp thư và kế hoạch event-driven. Production đã được truy vấn chỉ đọc bằng Supabase Management API với ref `tljfqavndndfsvtazibe`; `supabase/config.toml`, hostname DB và hostname function cron đều cùng ref.
- `AGENTS.md` và một số migration cũ ghi `bhtsnervqiwchluwuxki`; đó không phải target runtime hiện tại. Không đổi `project_id` trong config.
- Không sửa cron, dữ liệu production, secret hay deploy function. `git status` ban đầu đã có thay đổi `bun.lock`, `supabase/.temp/` và thư mục plan chưa track; các nội dung này được giữ nguyên.

### Cron thực tế (15/10/2026, production)

19 job Livestream đang active, tất cả function target hiện có trỏ tới project `tljfqavndndfsvtazibe`. Trong 24 giờ truy vấn được 15.546 lượt, 15.546 thành công, 0 thất bại cho nhóm này. `cron.job_run_details` chỉ giữ dữ liệu từ 11/10 16:26 UTC đến 15/10 01:08 UTC (~3,36 ngày), nên không thể xác nhận báo cáo 30 ngày. 9 job trong nhóm chạy mỗi phút; lượt chạy từng job phút là 1.437/24h.

| Job | Lịch production | Target | Chủ sở hữu |
|---|---|---|---|
| `agora-webcam-recording-processor-every-1min` | `* * * * *` | `live-webcam-recording-processor` | Agora |
| `agora-webcam-replay-reconciler-every-5min` | `*/5 * * * *` | `live-webcam-replay-reconciler` | Agora |
| `agora-webcam-stuck-promoter-every-1min` | `* * * * *` | `live-stuck-session-promoter` | Webcam |
| `agora-webcam-temp-cleanup-every-15min` | `*/15 * * * *` | `live-webcam-temp-cleanup` | Agora/R2 cleanup |
| `agora-webcam-zombie-cleanup-every-1min` | `* * * * *` | `live-zombie-cleanup` | Webcam lifecycle |
| `auto-finalize-recordings-every-5min` | `*/5 * * * *` | `auto-finalize-recordings` | Recording |
| `live-duration-watchdog-every-1min` | `* * * * *` | `live-duration-watchdog` | Session lifecycle |
| `live-recording-orphan-recover-every-10min` | `*/10 * * * *` | `live-recording-orphan-recover` | Agora recovery |
| `live-replay-archive-every-1min` | `* * * * *` | `live-replay-archive-cron` | RTMP/archive |
| `live-replay-cleanup-webm-backfill-every-2min` | `*/2 * * * *` | `live-replay-cleanup-webm-backfill` | Replay cleanup |
| `live-replay-mp4-poll-every-1min` | `* * * * *` | `live-replay-mp4-poll-cron` | Provider polling |
| `live-replay-poll-status` | `* * * * *` | `live-replay-poll-status` | Cloudflare replay |
| `live-replay-readiness-check-a` | `* * * * *` | `live-replay-readiness-check` | Replay readiness |
| `live-replay-rtmp-pending-rescue-hourly` | `0 * * * *` | `live-replay-mp4-poll-cron` | RTMP replay rescue |
| `live-replay-stream-ingest-every-5min` | `*/2 * * * *` | `live-replay-stream-ingest` | Stream ingest; job name lệch lịch |
| `live-rtmp-cleanup-stuck-every-30min` | `*/30 * * * *` | `live-rtmp-cleanup-stuck` | RTMP cleanup |
| `live-rtmp-grace-watchdog-every-1min` | `* * * * *` | `live-rtmp-grace-watchdog` | RTMP lifecycle |
| `live-session-events-retention-daily` | `15 4 * * *` | SQL `public.live_session_events_retention` | Event retention |
| `sync-active-live-state-every-5min` | `*/5 * * * *` | SQL `public.sync_all_active_live_states` | State sync |

Đối chiếu số liệu: 205 webcam và 9 RTMP trong 30 ngày được xác nhận từ DB. Không xác nhận được các tỷ lệ 71,5%, >99% lượt quét rỗng, 45%/20GB log ingestion hoặc tuyên bố Livestream là nguồn log lớn nhất; hiện không có quyền đọc bảng đo log ingestion. Báo cáo cũ 17.844 lượt/ngày và 11 job phút khác dữ liệu runtime vừa đọc.

### Hai pipeline riêng biệt

**RTMP/OBS — Cloudflare Stream:** `RtmpLivePage` → `create-rtmp-live-session` / `go-live-rtmp-session` → `live_sessions` + Cloudflare Live Input → Cloudflare `stream-webhook` cập nhật trạng thái/video → `end-rtmp-live-session` hoặc watchdog → `live-replay-archive-cron`/MP4 polling → xác minh media R2/replay → đồng bộ post feed → cleanup sau xác minh. Cloudflare webhook không phải webhook Agora; không thay đổi endpoint Cloudflare.

**Webcam — Agora Cloud Recording:** `PreLivePage` → `live-webcam-start` tạo session và post → Agora recording → host stop qua `live-end`/`live-webcam-stop` → `live-webcam-recording-processor` truy vấn/stop recording, archive R2 và xác minh → `live-webcam-replay-reconciler` tìm file HLS tạm còn thiếu → feed/replay chỉ chuyển playable sau gate xác minh → temp cleanup. Webhook mới chỉ đánh thức processor; truy vấn trạng thái và cron/reconciler vẫn làm lưới an toàn.

### Agora callback và giới hạn

Đã đối chiếu [tài liệu Agora Cloud Recording Notifications](https://docs.agora.io/en/realtime-media/cloud-recording/build/handle-events/receive-notifications). Agora hỗ trợ callback event 4 (playlist đầu tiên trong lúc ghi), 11 (`session_exit`) và 31 (`uploaded`, các file được upload tới storage đích); header HMAC-SHA1 `Agora-Signature` hoặc HMAC-SHA256 `Agora-Signature-V2`. Agora yêu cầu phản hồi HTTP 200 + JSON trong 10 giây và retry tối đa ba lần với khoảng chờ tăng dần. `sequence` giúp nhận biết sự kiện trùng/lệch thứ tự; `notifyMs` có thể đổi khi gửi lại. Event 31 xác nhận upload tới storage, không chứng minh URL public phát được; vẫn cần HEAD/list và kiểm tra URL phát theo code hiện có.

Project hiện **không có** secret tên `AGORA_CLOUD_RECORDING_WEBHOOK_SECRET`; không thể kiểm tra cấu hình callback trong Agora Console từ quyền hiện có. Vì vậy event path mới chưa hoạt động production. Sau khi Cha cấp secret qua dashboard và cấu hình callback, cần Stage A chạy song song lịch cũ để đo parity. Event 11/31 chỉ lưu receipt bền vững rồi đánh thức xử lý; event 4 không đánh thức processor. Idempotency dùng `sid:sequence`, unique partial index trong migration mới. Trạng thái authoritative vẫn đọc từ DB/provider; cron hiện hữu phục hồi callback bị mất.

### Dry-run mồ côi (production, chỉ SELECT)

SQL: `docs/superpowers/plans/2026-10-15-livestream-orphan-dry-run.sql`. Candidate pool được lọc `updated_at` cũ hơn 30 ngày và trạng thái còn dang dở; tuổi chỉ tạo tập cần rà soát, không chứng minh mồ côi hay terminal.

| Loại theo điều kiện dry-run | Sessions | Replays |
|---|---:|---:|
| Recoverable candidate, cần kiểm tra public URL hiện tại | 2 | 49 |
| Retryable candidate, cần kiểm tra provider | 539 | 1.003 |
| Đã mang nhãn unrecoverable, chưa xác minh | 3.815 | 44 |
| Ambiguous | 912 | 3.790 |

Đây là số hàng khớp điều kiện SQL, không phải số media đã kiểm tra hoặc orphan đã xác nhận. Không có hàng nào bị sửa/xóa/kết thúc; chưa gọi Cloudflare/Agora/R2 để xác minh object từng hàng. Không tạo post mới.

### Thay đổi cục bộ

- Thêm `agora-cloud-recording-webhook`, helper policy/chữ ký, và migration idempotency receipt. Config chỉ thêm block riêng cho function; không sửa project-level setting.
- Bỏ fail-final theo tuổi ở các luồng webcam/replay/orphan recovery và auto-mark `unrecoverable` theo tuổi; giữ pending + retry/backoff, giữ điều kiện media verification trước khi playable. `live-rtmp-cleanup-stuck` không tự kết thúc input chưa kết nối hoặc xóa nguồn theo tuổi; vẫn có thể rearchive flow an toàn vốn có.
- Thêm dry-run SQL phân loại và migration Stage B giới hạn ở cadence processor Agora từ mỗi phút sang mỗi 5 phút sau parity. Không có job nào bị gộp/xóa trong draft này. Rollback giữ nguyên job_id/command/target, khôi phục lịch mỗi phút: `docs/superpowers/plans/2026-10-15-livestream-event-driven-cost-reduction-rollback.sql`. Đã xác nhận `cron.alter_job(bigint,text,text,text,text,boolean)` có trên production.
- Files/functions liên quan: `supabase/functions/_shared/agoraRecordingWebhookPolicy.ts`, `supabase/functions/_shared/livestreamRecoveryPolicy.ts`, `supabase/functions/agora-cloud-recording-webhook/index.ts`, `live-webcam-recording-processor`, `live-webcam-replay-reconciler`, `live-replay-archive-cron`, `live-replay-poll-status`, `live-rtmp-cleanup-stuck`, `live-stuck-session-promoter`, `live-recording-orphan-recover`; test `src/modules/live/agoraRecordingWebhookPolicy.test.ts`.
- Chưa commit; không có commit SHA. Không đổi secret, không áp migration, không deploy function hoặc lịch cron. Production vẫn chạy 19 lịch như trước.

### Xác minh và giai đoạn tiếp theo

- `bunx --package vitest@4.1.5 vitest run --configLoader runner src/modules/live/agoraRecordingWebhookPolicy.test.ts`: đạt, 1 file / 5 test. Lệnh nguyên bản `bunx vitest run ...` ban đầu không khởi động do `node_modules/.deno` ghép Vitest 4.1.11 với Vite 5.4.21; lệnh thay thế chạy thành công nhưng Bun báo đã ghi lockfile, cần giữ nguyên thay đổi `bun.lock` có sẵn và rà lại trước commit.
- `bunx --package @typescript/native-preview tsgo`: đạt, exit 0.
- `deno check --node-modules-dir=auto` trên webhook và 7 function đã sửa: thất bại với 11 diagnostic có sẵn ở helper `agoraCloudRecordingService`, `r2MultiBucketService`, `replayFeedService`, `rtmpEndLiveService`, cùng nullable `sourceHead` tại dòng cũ trong processor. Không có diagnostic ở webhook/policy/reconciler mới; lỗi `sourceHead` nằm trong file được sửa nhưng dòng đó không thuộc patch.
- `git diff --check`: đạt.
- Kiểm tra 24h cron: 15.546/15.546 thành công, 0 thất bại trong nhóm. Nếu sau parity đổi processor 1.437 lượt/ngày sang 288 lượt/ngày, dự kiến giảm 1.149 lượt/ngày (~7,4% của nhóm 19 job hiện tại); đây là phép chiếu chỉ cho một job, chưa tính invocation webhook và chưa đo log. Tần suất fallback tối đa 5 phút làm tăng độ trễ fallback tới 5 phút; callback có thể đánh thức sớm khi nhận được.

**Để tiếp tục cần Cha duyệt:** (1) cấu hình callback Agora và thêm secret qua dashboard an toàn; (2) để event chạy song song đủ thời gian đo callback/parity, provider error, replay-ready latency và missed-work recovery; (3) sau khi xem số liệu Stage A, duyệt rõ migration Stage B cho project `tljfqavndndfsvtazibe`. Chỉ khi Cha duyệt mới áp migration/deploy. Giá trị secret không cần gửi trong chat.

---

## Cập nhật triển khai — 2026-10-15

- Livestream changes đã commit bằng `11edc96` và push lên `main`; sau đó merge commit mới từ `origin/main` và push thành công tại `0ba498e`. Không force-push.
- Test tập trung: 3 file / 14 test đạt. `bunx --package @typescript/native-preview tsgo --noEmit` đạt; `git diff --check` đạt.
- Deploy thành công tới `tljfqavndndfsvtazibe`: `agora-cloud-recording-webhook` (ACTIVE v1), `live-recording-orphan-recover` (v70), `live-replay-archive-cron` (v75), `live-replay-poll-status` (v70), `live-rtmp-cleanup-stuck` (v70), `live-stuck-session-promoter` (v70), `live-webcam-recording-processor` (v70), `live-webcam-replay-reconciler` (v70).
- Production preflight trước index: chưa có index, 0 receipt trùng và 0 receipt webhook cũ. Đã áp riêng `20261015090000_agora_recording_webhook_idempotency.sql` bằng query SQL trực tiếp; xác minh sau đó index tồn tại và vẫn 0 key trùng. `supabase db push --dry-run` đề xuất một backlog migration lớn, nên không chạy `db push`. SQL trực tiếp không tự ghi migration history; cần xử lý lệch migration history trong một đợt riêng.
- Smoke test endpoint: OPTIONS trả 204; POST không chữ ký trả 401. `AGORA_CLOUD_RECORDING_WEBHOOK_SECRET` chưa có, webhook Agora chưa được cấu hình, nên chưa test được chữ ký hợp lệ hoặc callback/recording end-to-end.
- Deno check webhook và `live-recording-orphan-recover`, `live-rtmp-cleanup-stuck` đạt. Các entrypoint replay/processor/promoter còn lỗi kiểu tại helper dùng chung (`replayFeedService`, `rtmpEndLiveService`, `r2MultiBucketService`, `agoraCloudRecordingService`) và nullable `sourceHead`; Supabase CLI vẫn deploy thành công, nhưng cần xử lý các diagnostic này trong một task riêng.
- Không deploy hoặc áp dụng `20261015091000_reduce_agora_processor_cron_after_parity.sql`; file vẫn chỉ ở workspace, chờ đo parity Stage A và duyệt lịch.

## Điều tra replay RTMP không hiện video — 2026-10-15

- Cha báo phiên RTMP đã kết thúc nhưng video không được lưu/hiện trên feed. Production row khớp ảnh là session `a62444df-dd60-4d34-8706-14e306db89af`, replay `3a778f45-792e-4f32-84b4-414bcb332ac0`, post `9268ae12-3fc2-4292-b032-fb39ba4a1ef1`.
- Root cause đầu tiên được xác nhận từ `live_replays.archive_error`: `Invalid R2 public URL config`. Video Cloudflare đã materialize, nhưng validator trong `r2StorageService` chặn upload R2; vì vậy post bị giữ ở `processing` và không có URL video.
- Đối chiếu năm replay R2 vừa xác minh thành công cho thấy public host hiện hành là `https://media.fun.rich`; HEAD một replay cũ trả 200. Đã cập nhật production secret `R2_PUBLIC_DOMAIN` sang host này (không đọc/ghi các secret khác).
- Archive cron sau đó upload và xác minh MP4 thành công (`9,646,336` bytes; `r2_verified_at=2026-10-15 08:49:10 UTC`; public HEAD 200). Cron để phase `posting` ở trạng thái `archived` nên bucket recovery chỉ nhận lại sau ngưỡng 10 phút; đã requeue đúng replay có R2 verification để lịch cron xử lý tiếp.
- Post đã được đồng bộ lại sang URL MP4 xác minh, `replay_ready=true`, `replay_status=ready_mp4`; session `archived`/`recording_status=ready`; replay `archive_phase=done`, `archive_status=replay_posted`, Cloudflare source đã xóa sau khi R2 sẵn sàng.
- Thêm regression test: `createOrUpdateReplayPost` phải publish trạng thái ready khi replay row cũ vẫn mang `processing`/`stream_ready`. Sửa helper để verified R2 post luôn ghi `ready_mp4`, `r2_ready`, và xóa processing message.
- Kiểm tra: test replay feed 2/2 đạt; `tsgo --noEmit` đạt; `git diff --check` đạt. Cần deploy `live-replay-archive-cron` để đưa helper đã sửa lên production và commit/push thay đổi code.

## Bắt đầu sửa RTMP no-video auto-end — 2026-10-17

- Cha xác nhận đã thông báo vào nhóm Coordinator trên Telegram trước khi bắt đầu.
- Bé sẽ điều tra và sửa trường hợp Cloudflare Live Input còn `connected` nhưng không có active video thuộc cửa sổ phiên hiện tại; phạm vi gồm policy dùng chung, RTMP watchdogs, test pipeline replay/feed nếu regression chứng minh lỗi, migration nullable cho mốc no-video grace nếu cần, và kế hoạch phát hành.
- Nhánh dự kiến: `fix/rtmp-no-video-auto-end`. Không deploy, áp migration production, sửa cron/secret hoặc tạo/kết thúc phiên production trong task này.
- Preflight: `main` tại `1c83286`, khớp `origin/main`; chỉ có plan RTMP mới và `supabase/.temp/` chưa được theo dõi. Cả hai được giữ nguyên; `.temp/` không thuộc diff.

## Kết quả sửa RTMP no-video auto-end — 2026-10-17

- Root cause trong code đã xác nhận: hai cron từng coi `inputConnected` là nguồn khỏe dù không có video live thuộc cửa sổ phiên; `live-replay-archive-cron` vì thế không bắt đầu grace. `get-rtmp-live-session-status` cũng refresh `last_connection_check_at` trong lúc trang đang mở, có thể làm phiên không lọt vào các truy vấn stale của watchdog còn lại.
- Thêm policy/helper dùng chung cho ba điểm poll RTMP: phân biệt video phiên hiện tại, input connected/no video, input disconnected và unknown/error. Grace no-video dùng `RTMP_DISCONNECT_GRACE_SECONDS` (mặc định 180 giây), mốc `video_signal_lost_at` chỉ ghi lần đầu, được xóa khi video phiên hiện tại trở lại hoặc input mất kết nối. Sau grace có Cloudflare recheck mới; chỉ no-video/disconnected đã đọc thành công mới gọi end-service có fencing. Query marker pending giúp grace watchdog vẫn quét được khi status poll đang làm mới heartbeat.
- Sửa cron archive không còn ghi `status='ended'` trực tiếp trước end-service. Log timeout chỉ ghi sau khi fenced end thực sự thành công. API/DB/unknown defer; lỗi DB trong cập nhật marker/recovery làm lượt xử lý thất bại rõ ràng.
- Thêm migration `20261017090000_rtmp_no_video_grace.sql` cho cột nullable và partial index. Migration chưa được chạy ở local hay production; phải áp dụng trước khi phát hành Edge Functions.
- Replay/feed: đã xác minh end-transition hiện có chốt session/post/replay cùng giao dịch; archive cron phục hồi replay thiếu bằng `live_session_id`, upsert theo session, và `createOrUpdateReplayPost` cập nhật post hiện tại. Archive service chỉ báo ready sau public R2 media verification. Test feed được mở rộng để retry hai lần vẫn cập nhật cùng post, không insert trùng. Không phát hiện lỗi pipeline cần sửa.
- Kiểm tra đạt: 5 file Bun / 34 test; `bunx --package @typescript/native-preview tsgo --noEmit`; `deno check` cho `get-rtmp-live-session-status`, `live-replay-archive-cron`, `live-rtmp-grace-watchdog`; `git diff --check`.
- Chưa deploy, chưa áp migration, không đổi cron/secret/dữ liệu production; không commit/push. Sau migration cần deploy đúng 3 function: `get-rtmp-live-session-status`, `live-replay-archive-cron`, `live-rtmp-grace-watchdog`; lịch cron hiện tại không đổi.
- Giới hạn: không truy cập production logs/telemetry cho phiên nêu trong yêu cầu ở lượt này, nên root cause của một sự kiện live cụ thể chưa được khẳng định. Policy xác định mất active video theo Cloudflare metadata/current-session window; OBS vẫn encode cảnh đen/trống thì vẫn là video hoạt động và không thể phân biệt nội dung có ý nghĩa chỉ bằng tín hiệu kết nối.

## Phát hành RTMP no-video auto-end — 2026-10-17

- Cha yêu cầu commit, push và deploy sau khi review thay đổi.
- Trước khi phát hành: 34 test RTMP/replay đạt; `tsgo --noEmit`, `deno check` ba Edge Function và `git diff --check` đạt.
- Production project `tljfqavndndfsvtazibe` đã được xác nhận qua Supabase CLI. Migration `20261017090000_rtmp_no_video_grace` được áp dụng riêng bằng nội dung migration chính xác; truy vấn chỉ đọc xác nhận cột `video_signal_lost_at` và index `idx_live_sessions_rtmp_video_signal_lost` tồn tại. Migration được ghi nhận riêng trong lịch sử Supabase để không chạy `db push` hàng loạt khi lịch sử production còn lệch nhiều migration cũ.
- Commit `713f88e` đã được push lên `main`; `HEAD` khớp `origin/main`.
- Đã deploy và xác minh ACTIVE trên production: `get-rtmp-live-session-status` v77, `live-replay-archive-cron` v83, `live-rtmp-grace-watchdog` v77. Không đổi cron hoặc secret.
- Chưa chạy live test thật trong OBS. Cần kiểm tra một phiên test: OBS ngừng phát, đợi grace (mặc định 180 giây) cộng tối đa một chu kỳ watchdog, xác nhận phiên kết thúc; sau đó theo dõi replay/feed tới khi URL R2 được xác minh và post hiện tại được cập nhật.

## Hotfix RTMP reconnecting bị constraint chặn — 2026-10-17

- Cha báo lỗi sau khi tắt OBS ở phiên `1d70f498-e38a-49c0-b0dc-86829112fb01`. Truy vấn production xác nhận `live_sessions_status_check` có `ending` và `disconnect_grace`, nhưng thiếu `reconnecting` mà status endpoint đang ghi. Vì cập nhật thất bại, mốc mất nguồn/deadline không được lưu và auto-end bị kẹt. Kiểm tra phát hành trước đó chưa kiểm tra đầy đủ hợp đồng trạng thái với schema production.
- Migration riêng `20261017100000_rtmp_reconnecting_status.sql` giữ nguyên biểu thức allowlist đang cài và thêm `reconnecting`; state guard cũng chặn terminal -> reconnecting, giữ quy tắc không mở lại phiên đã kết thúc. Không sửa dữ liệu phiên thủ công hoặc thay grace/cron/secret.
- Thêm SQL regression `supabase/tests/rtmp_status_contract.sql`: sao chép constraint và dùng trigger guard production trên bảng tạm; kiểm tra live -> reconnecting -> live -> reconnecting -> ending -> processing_replay -> archived, từ chối trạng thái tùy ý và chặn terminal -> reconnecting. Test cũ thất bại đúng tại reconnecting; migration + test trong giao dịch rollback đạt; sau áp dụng migration, test production đạt. Test chỉ ghi bảng tạm và rollback.
- Migration đã áp dụng riêng trên `tljfqavndndfsvtazibe` và ghi nhận đúng version; không chạy toàn bộ migration pending. Chỉ thay schema nên không cần deploy lại Edge Function. Bun 28 test policy/fencing đạt, `tsgo --noEmit` đạt.
- Sau migration, phiên test thật đã chuyển từ live sang reconnecting và lưu `signal_lost_at` cùng deadline sau 60 giây. Đây là grace mất kết nối transport của status endpoint; grace connected/no-video vẫn dùng cấu hình riêng hiện hành.
- Xác minh tiếp trên phiên thật: tự kết thúc lúc `2026-10-16 20:59:22.655 UTC`, reason `obs_signal_lost_timeout`; post hiện có chuyển `live_replay`/`processing`, đúng một replay được tạo. Không gọi end thủ công. Tại `21:00:12 UTC`, replay còn pending; chưa khẳng định media đã archive/phát lại được.

## Chuẩn bị hardening chat/call — 2026-10-17

- Branch: `fix/quangvu-chat-call-hardening`. Coordinator đã được báo trước; phạm vi theo spec `docs/superpowers/specs/2026-10-17-chat-call-hardening-design.md` và plan `docs/superpowers/plans/2026-10-17-chat-call-hardening.md` đã được Cha duyệt. Không commit/push.
- Target production theo thông tin đã xác minh trước đó là Supabase `tljfqavndndfsvtazibe`; `supabase status` hiện cũng chỉ xác nhận liên kết tới project này, đồng thời báo Docker/Podman không có. Không có production write, migration apply, function deploy, secret edit hoặc cuộc gọi thật.
- Read-only catalog query trên production (project ref đã liên kết đúng) xác nhận RLS bật cho tám bảng conversation/message/block/call; publication `supabase_realtime` chỉ có `live_comments`, `live_messages`, `live_reactions`, `live_sessions`, chưa có chat/call. Các policy legacy nghi vấn còn hiện diện, gồm “Users can view conversations they are part of”, “Users can add participants to conversations”, “Users can update their own participant record”, và trực tiếp tạo/cập nhật call. Catalog còn cho thấy grants `anon` rộng và grants trực tiếp `authenticated` trên call/conversation tables; RLS policies vẫn là lớp lọc hiện thời. Migration draft thu hẹp grants và thay policy; trạng thái production chưa đổi.
- Phát hiện đã xử lý trong code: frontend gọi endpoint `agora-token` không tồn tại; RLS chat có policy tham chiếu sai và cho phép một số thao tác thành viên không an toàn; publication thiếu các bảng chat/call cần thiết; client tạo call trước token và có nhánh cleanup/status thiếu điều kiện; call thiếu gia hạn token; block query phụ thuộc policy không khớp; media upload chat chưa ràng buộc owner-prefix/loại/giới hạn file và composer làm mất retry context; search filter nhận ký tự điều khiển PostgREST; các lỗi DB quan trọng trong conversation/message flow bị bỏ qua. Đây là phát hiện từ code, chưa phải xác minh hành vi production.
- Ba migration chỉ được chuẩn bị trong repo, chưa áp dụng: `20261017110000_chat_security_realtime.sql`, `20261017111000_chat_message_access.sql`, `20261017112000_agora_call_lifecycle.sql`. Chúng thêm RPC bảo vệ conversation/group/block/call, RLS/GRANT, stable Agora UID và publication membership giữ bảng live hiện có. Không tạo unique index toàn cục cho open-call vì production có dữ liệu trùng; `start_call_session` dùng advisory lock và kiểm tra open call, partial unique index chỉ áp dụng participant còn active. Migration không tự đóng 12 call production hiện có. Fixture/test SQL là `supabase/tests/chat_security_realtime_fixture.sql` và `supabase/tests/chat_security_realtime.sql`.
- Edge Function `agora-call-token` được thêm với JWT, trạng thái/membership/block check qua RPC, channel/UID do DB quyết định và thông báo tiếng Việt an toàn. `get-upload-url`/`delete-from-r2` được sửa cho prefix chat-media. Frontend chat/call chuyển sang các RPC, fencing callback cũ, cleanup lỗi, token renewal và nút resume audio sau autoplay block. Luồng hỗ trợ Claim Rewards cũng chuyển sang RPC DM để không còn tự insert conversation/participants bị RLS mới chặn.
- Read-only production preflight thấy 12 open call rows trong 7 conversation: 9 ringing và 3 active; 3 active thuộc cùng một conversation, tạo ngày 2026-02-21. Có 3 conversation chứa nhiều open rows. Chín ringing quá timeout 45 giây hiện tại; migration mới chỉ chuyển chúng sang `missed` khi có thao tác bắt đầu call trong conversation đó. Ba active cũ vẫn ambiguous và chặn call mới ở conversation đó; cần operator xác minh, không tự close.
- PostgreSQL 17.11 local thật đã được khởi tạo trên port 55432. Ba migration chạy tuần tự trên fixture lấy schema/function/trigger/grants/policy từ production catalog; SQL test dưới role `authenticated` + JWT GUC đạt, kết thúc `ROLLBACK`. Fixture mô phỏng cả duplicate participant đã ended và 12 open call rows trên 3 conversation mà không sửa/dọn chúng; migration không fail. Psql concurrency bằng hai connection: start race tạo đúng 1 row (request kia từ chối `23505`), accept/decline race chỉ một đổi trạng thái, concurrent end chỉ một thành công; late accept/decline trả false, status/duration terminal giữ nguyên.
- Local không mô phỏng GoTrue/JWT signature, PostgREST, Realtime service delivery hoặc Edge Runtime/Agora. `supabase db dump --linked` thất bại vì cần Docker; fixture dựng từ catalog truy vấn chỉ đọc. `supabase status` xác nhận linked ref production nhưng báo Docker/Podman không có.
- Kiểm tra cuối: focused Vitest 7 file / 19 test đạt; `bunx --package @typescript/native-preview tsgo --noEmit` exit 0; `deno check --no-lock` cho ba entrypoint đạt; `deno test --no-lock supabase/functions/agora-call-token/index.test.ts` 3/3 đạt; `git diff --check` đạt. SQL integration `chat_security_realtime.sql` kết thúc `ROLLBACK`; `bash supabase/tests/chat_call_concurrency.sh` đạt. Vitest có warning deprecation `optimizeDeps.esbuildOptions` từ react-swc.
- Chưa kiểm tra Safari/iPhone thật hoặc call end-to-end giữa hai tài khoản. Agora credentials hiện có/đúng trong dashboard production chưa được đọc; không thay secret. R2 chat media vẫn dùng URL public `media.fun.rich`; file đính kèm không được bảo vệ theo membership. Giới hạn upload với presigned PUT dựa vào `fileSize` client gửi; chưa có completion HEAD kiểm chứng kích thước thật.
- Rollback matrix và ma trận test thiết bị được ghi tại `docs/chat-call-hardening-2026-10-17/release-and-rollback.md`. Không có down migration an toàn vì sẽ phục hồi quyền/policy không an toàn; hướng rollback là giữ schema forward-only, sửa function/policy bằng migration mới và chỉ dùng frontend tiếp tục gọi RPC. Không rollback về frontend cũ vốn ghi trực tiếp call/participants.
- Trạng thái: code đủ để đưa lên staging/preview, **chưa đủ điều kiện production không giới hạn**. Cổng còn lại: operator xác minh 3 call `active` rất cũ trong cùng conversation; chạy staging Supabase thật, nhất là PostgREST/Realtime/JWT; và quyết định rõ attachment dùng URL public có chấp nhận được không. Nếu chat attachment phải riêng tư, cần signed-read + kiểm tra membership trước khi bật file sharing; nếu cần size cap chống client giả, cần server-side upload completion/HEAD verification.
- Sau các cổng trên, phát hành theo cửa sổ ngắn: ba migration riêng theo timestamp, functions `agora-call-token`, `get-upload-url`, `delete-from-r2`, rồi frontend/Cloudflare Pages. Migration trước frontend có thể làm client cũ tạm lỗi group/call writes; buộc reload và giảm khoảng chuyển tiếp. Chưa deploy hoặc áp dụng migration trong task này. Giữ nguyên `supabase/.temp/`; không đưa vào diff phát hành.

### Xác minh bàn giao bổ sung — 2026-10-17

- Chạy lại focused Vitest: 7 file / 19 test đạt; `tsgo --noEmit` đạt; `deno check --no-lock` ba function và `deno test --no-lock` Agora token 3/3 đạt.
- Chạy lại `supabase/tests/chat_security_realtime.sql` trên PostgreSQL tạm, dưới `authenticated` + JWT claims; kết thúc `ROLLBACK`. `bash supabase/tests/chat_call_concurrency.sh` đạt với start, accept/decline, end và terminal fencing đồng thời.
- `git diff --check` đạt; nhánh vẫn là `fix/quangvu-chat-call-hardening`. `supabase/.temp/` còn nguyên, không đưa vào thay đổi có chủ đích.
- Không áp migration, deploy function, thay secret, sửa cron hay dữ liệu production; không commit/push. Kết luận phát hành giữ nguyên: đủ để chuyển sang preview/staging có kiểm soát, chưa đủ điều kiện production cho file sharing riêng tư hoặc call ở conversation đang có ba row `active` cũ chưa được operator xác minh.

## Commit/push bản sửa chat/call — 2026-10-18

- Đã commit toàn bộ thay đổi thuộc task trên nhánh `fix/quangvu-chat-call-hardening`: `6a0e102dfab188f654e71b9ee23f94938e583ee2` (`fix(chat): harden messaging and Agora calls`).
- Đã push nhánh lên `origin/fix/quangvu-chat-call-hardening`; upstream đã thiết lập. Không merge, không push `main`, không force-push. `supabase/.temp/` vẫn ngoài commit.
- Trước commit: staged diff check và credential-pattern scan không có lỗi/không có kết quả khớp; test/source verification dùng lại kết quả đạt ở lượt trước vì không có thay đổi source từ lần đó. Chỉ bỏ trailing whitespace trong spec mới và cập nhật tài liệu bàn giao.
- Cổng còn lại trước production: operator xác minh 3 call `active` cũ; chạy preview/staging với hai tài khoản desktop và Safari iPhone; quyết định media public có chấp nhận được không hoặc thêm signed-read/HEAD verification trước khi bật file sharing riêng tư.

## Phát hành chat/call — 2026-10-18

- Cha yêu cầu tiếp tục migration, merge/push main và phát hành. Commit `67bf611` bổ sung tạm khóa upload file chat mới ở menu, client upload helper và `get-upload-url` (503 `CHAT_ATTACHMENTS_PAUSED`); test regression xác nhận upload posts/avatar vẫn không bị chặn. Link media cũ vẫn công khai, chưa triển khai signed-read.
- Kiểm tra mới: Vitest 7 file/20 test, Deno token 3 test, `tsgo --noEmit`, Deno check 3 function và build production đều đạt. Build có cảnh báo dependency/chunk hiện có; sync cascade không đọc được epoch_config bằng anon nên giữ constants cũ, các test cascade vẫn đạt. Không mở rộng quyền epoch_config trong task này.
- Xác minh thêm ba call legacy: tất cả đã có `ended_at` nhưng còn status active. Trong giao dịch phát hành, chỉ sửa đúng ba ID đó sang ended khi `status='active' AND ended_at IS NOT NULL`; giữ nguyên thời điểm kết thúc, không gọi người thật và không cleanup theo tuổi. Sau phát hành không còn active trong ba ID đó.
- Đã áp đúng ba migration `20261017110000`, `20261017111000`, `20261017112000` trong một transaction, chạy catalog assertions quyền/RPC/publication trước commit, sau đó ghi nhận riêng ba version. Không chạy db push toàn bộ. Post-release catalog assertions đạt; publication có 7 bảng chat/call mới cộng 4 bảng livestream cũ.
- Supabase `tljfqavndndfsvtazibe`: `agora-call-token` ACTIVE v1; `get-upload-url` ACTIVE v78; `delete-from-r2` ACTIVE v78. Endpoint token OPTIONS trả 204; POST chưa đăng nhập trả 401 an toàn. Chỉ xác nhận tên AGORA_APP_ID/AGORA_APP_CERTIFICATE có mặt, không đọc giá trị hoặc xoay key.
- Nhánh sửa đã fast-forward vào main và push `67bf611`; Lovable project `331267a9-893e-47d1-8309-12038b7636f7` xác nhận latest_commit_sha khớp. Đã gửi publish request (deployment `e8b7fe02-d4c9-425c-960f-a871a76a5038`, trạng thái ban đầu pending).
- Sau thời gian build/phát hành, đã kiểm tra bundle thật: fun.rich tải `Chat-BXvayuqW.js`, funprofile.lovable.app tải `Chat-uDBKOP4w.js`; cả hai chứa endpoint `agora-call-token` và UI `Gửi tệp tạm dừng`. Domain thật đã nhận code mới. Yêu cầu đăng nhập Cloudflare trước đó không còn cần thiết; không thay cấu hình Cloudflare qua UI.
- Chưa test RTC thực tế hai tài khoản/Safari iPhone. Cần xác minh frontend thật trước, rồi kiểm tra gọi/nhắn tin bằng hai tài khoản thử nghiệm. `supabase/.temp/` được giữ nguyên ngoài commit.


## 2026-11-21 · BẮT ĐẦU DỌN TOÀN BỘ CLOUDFLARE STREAM

- Quang Vũ cùng Angel Muse; Cha xác nhận đã gửi Telegram và yêu cầu giải phóng toàn bộ quota 1.000 phút.
- Hiện trạng gần nhất: 529 video, 722/1.000 phút; cần kiểm kê lại trước thao tác.
- Nhánh: `fix/quangvu-stream-full-cleanup`, từ `origin/main` tại `a5252ec`.
- Phạm vi: kiểm kê toàn tài khoản Stream, đối chiếu tham chiếu DB/feed và R2; sao lưu, kiểm chứng trước khi xóa nguồn; giữ khả năng xem lại trên feed; hồ sơ và cách phục hồi trong `docs/stream-full-cleanup-2026-11-21/`. Không xóa live input/stream key.
- Chưa xóa dữ liệu trong đợt này. Không xóa video đang live hoặc chưa có bản sao đã kiểm chứng.


## 2026-11-21 · CHECKPOINT BACKUP TOÀN BỘ STREAM — CHỜ XÁC NHẬN UPLOAD

- Nhánh `fix/quangvu-stream-full-cleanup`; đã kiểm kê đủ 529 UID, 35 UID có nội dung tổng ~721,84 phút; 1 UID đang LIVE được bảo vệ.
- Đã backup 34 VOD / 5.130.690.432 byte; kiểm chứng cấu trúc, thời lượng, SHA-256 và giải mã (2 full, 32 lấy mẫu); thử ghép lại đủ 34 file thành công. 47 file gói phục hồi đã sẵn sàng local.
- Auto-review chặn upload gói mới vì xác nhận cũ chỉ 12 file/2,77 GB. Chờ Cha xác nhận upload 47 file/5,13 GB vào bucket public fun-rich-media, prefix stream-full-backups-2026-11-21/. Không thử bypass.
- Chưa upload gói mới, chưa xóa Stream, chưa thay DB/feed; quota vẫn là số đo đầu đợt 722/1.000 phút, chưa tuyên bố đạt 1.000 phút trống. Hồ sơ `docs/stream-full-cleanup-2026-11-21/`.


## 2026-11-22 · BACKUP R2 ĐÃ KIỂM CHỨNG — CHỜ XÁC NHẬN XÓA NGUỒN

- Cha đã xác nhận gói mới; upload hoàn tất, GET kiểm chứng 47/47 file SHA-256/dung lượng khớp; kiểm tra HEAD mới đủ 47 file và manifest không đổi. 34 VOD / 5,13 GB có bản local, R2 và thử ghép phục hồi thành công.
- Phiên Paper 23 cũ đã tự archived, bản R2 HEAD200 / Stream404. 34 nguồn còn lại có ~721,58 phút; kiểm tra lại 5 session đều ended, 0 replay tham chiếu, 1 post đang phát bằng R2 chỉ còn HLS cũ trong metadata.
- Chưa xóa nguồn, chưa thay DB/feed, chưa đạt/tuyên bố 1.000 phút trống. Cần xác nhận tại bước xóa vĩnh viễn theo cảnh báo Cloudflare. PR nháp #67: https://github.com/MinhTriDiamond/funprofile-supabase/pull/67 . Hồ sơ và danh sách UID: docs/stream-full-cleanup-2026-11-21/.


## 2026-11-22 · ĐÃ XÓA BATCH 34, TIẾP TỤC XỬ LÝ BẢN GHI PHÁT SINH

- Cha xác nhận xóa vĩnh viễn batch 34; đã thực hiện đúng 34 UID qua dashboard, không xóa input hay mục lỗi. Đang kiểm chứng HTTP404 toàn batch.
- Có bản ghi mới ngoài inventory ban đầu: ebbf09e0267c6f06aaf53f374fbd799d, 21 Nov 26 13:57 UTC, Ready, manifest 6.046,101 giây (~100,77 phút). Session theo UID không có kết quả. Chưa xóa nguồn mới.
- Tiếp tục mục tiêu dọn toàn quota trên cùng nhánh fix/quangvu-stream-full-cleanup: đối chiếu tham chiếu và backup local nguồn phát sinh trước; xác nhận xóa 34 không được coi là xác nhận xóa UID mới.


## 2026-11-22 · BATCH 34 ĐÃ XÓA VÀ KIỂM CHỨNG; CÒN 1 BẢN GHI MỚI

- 34/34 nguồn được Cha xác nhận đã xóa và HEAD404; bản R2 của feed vẫn HEAD200. Quota hiện còn khoảng 101 phút do bản ghi phát sinh mới ngoài inventory/batch xác nhận.
- Đã backup local UID ebbf09e0267c6f06aaf53f374fbd799d (100,77 phút / 921.465.831 byte), SHA-256 + mẫu giải mã đạt, thử ghép phục hồi khớp. 0 tham chiếu DB/feed. Gói bổ sung 6 file sẵn sàng cho prefix public stream-new-backup-2026-11-22/; chưa upload/chưa xóa UID mới.
- Chờ xác nhận riêng phần phát sinh mới; PR67 vẫn nháp, không tuyên bố 1.000 phút trống khi còn nguồn mới.


## 2026-11-22 · HOÀN TẤT DỌN QUOTA STREAM — TRỐNG ĐỦ 1.000 PHÚT

- Dashboard tải mới sau nguồn cuối: **494 mục, 0/1.000 phút lưu trữ, 0% — trống đủ 1.000 phút**. Giữ nguyên 494 mục lỗi không phát được và live input/stream key.
- Đã backup 35 VOD (~6,05 GB), thử ghép phục hồi local và GET kiểm chứng 53/53 file R2 khớp SHA-256/dung lượng, sau đó xóa đúng batch 34 + 1 UID bổ sung theo xác nhận của Cha. 34 nguồn cũ và nguồn bổ sung HTTP404; video R2 của feed vẫn HEAD200/639.076.510 byte.
- Không thay DB/feed/cron/secrets trong đợt này. Hồ sơ, rollback và tin Telegram hoàn tất: docs/stream-full-cleanup-2026-11-21/README.md. PR hồ sơ #67: https://github.com/MinhTriDiamond/funprofile-supabase/pull/67 (kết quả production đã kiểm chứng; hồ sơ đi qua cổng Preview trước merge).


## 2026-11-24 · BẮT ĐẦU SỬA YOUTUBE ERROR 153

- Quang Vũ cùng Angel Muse; Cha xác nhận đã gửi Telegram.
- Nhánh: fix/quangvu-youtube-error-153, từ origin/main mới nhất.
- Phạm vi: LinkPreviewCard trên feed và kiểm thử hồi quy; kiểm tra iframe/referrer, xác minh Preview trước merge. Không thay DB, Edge Function hoặc cấu hình project.
- Hiện trạng: iframe đang dùng referrerPolicy=no-referrer, phù hợp triệu chứng YouTube Error153. Đối chiếu tài liệu chính thức và tái hiện bằng kiểm thử trước sửa.


## 2026-11-24 · KẾT QUẢ BẢN SỬA YOUTUBE ERROR 153

- Đã sửa LinkPreviewCard cho YouTube/youtube-nocookie iframe gửi origin Referer theo khuyến nghị chính thức; không gửi path/query, provider khác và link ngoài giữ chính sách cũ. Không đổi backend/DB.
- 35/35 test feed (gồm 7 test mới) và tsgo đạt; test RED trước sửa đúng 4 ca YouTube + request browser không có Referer, GREEN sau sửa gửi đúng origin.
- Đúng video PdNMiq0X2BI trong ảnh đã được bấm phát thành công trong browser fixture render component thật: currentTime >0 và paused=false. Review không có Critical/Important. Hồ sơ docs/youtube-error-153-2026-11-24/.
- Bản sửa đang chuẩn bị PR và cổng Preview trước merge.


## 2026-11-24 · HỒ SƠ KẾT QUẢ YOUTUBE ERROR153 — PR #73

- Bản sửa và kiểm thử: https://github.com/MinhTriDiamond/funprofile-supabase/pull/73 . 35/35 test feed, tsgo và review đạt; video PdNMiq0X2BI đã phát thực trong browser fixture (currentTime>0, paused=false), request chỉ gửi origin Referer.
- Hồ sơ và tin Telegram hoàn tất: docs/youtube-error-153-2026-11-24/README.md. Cổng Cloudflare Preview phải đạt trước merge; trạng thái merge/deploy xem PR. Không thay DB/backend hay headers toàn site.


## 2026-11-24 · BẮT ĐẦU KIỂM TRA UPLOAD VIDEO / 10 GB

- Quang Vũ cùng Angel Muse; Cha xác nhận đã gửi Telegram cho việc mới.
- Nhánh: fix/quangvu-video-upload-10gb từ origin/main mới nhất.
- Hiện trạng: Create Post báo upload thất bại với video 6:08; ảnh chưa cung cấp kích thước/mã lỗi. Code đang giới hạn tài khoản thường 2 GiB, admin 10 GiB, frontend và backend cùng phân quyền.
- Phạm vi: cấu hình/validation upload video bài viết, multipart R2, thông báo lỗi và kiểm thử hồi quy; chẩn đoán production chỉ đọc để phân biệt lỗi upload với giới hạn. Không xóa video, không đổi schema hoặc secrets; nếu cần mở rộng sẽ ghi nhận trước.
- Mục tiêu: hỗ trợ tối đa 10 GiB/video (theo đơn vị 1024 của code hiện tại), giữ giới hạn thời lượng 4 giờ, kiểm chứng Preview trước merge; không coi ảnh là bằng chứng nguyên nhân.

- Chẩn đoán thêm: không có phiên upload mới ngày24/11 cho user trong ảnh; lần retry UI theo xác nhận riêng vẫn trả lỗi chung, không chứng minh do size. Hàm calculateFileHash đang file.arrayBuffer() toàn tệp trước initiate; đây là điểm không đáp ứng10GiB. Giữ SHA256 đầy đủ/tương thích resume, đổi đọc từng chunk, không dùng hash lấy mẫu. Đồng bộ config frontend/backend10GiB cho bài viết; chat giữ2GiB ngoài phạm vi. Cần deploy lại các function tiêu thụ shared mediaLimits sau Preview; lưu bản production trước deploy/cách khôi phục. Không đổi schema/secrets.


## 2026-11-24 · KẾT QUẢ CODE VIDEO 10 GiB — PR #74

- Frontend/sharedbackend video bài viết2→10GiB cho tài khoản thường; giữchat2GiB/thời lượng4giờ. Hash đọc8MiB/lượt, giữresumeID, JWT theo sessionrefresh; lỗi đãphân loại hiển thị trongcomposer.
- 55/55test11file, tsgo vàbuildlocal đạt; review codekhông cóblocker. Mô phỏng205part đúng10GiB; hashfull10GiB giảlập1280lượt, max8MiB, khớpnodeSHA256. Chưaupload10GiB thật.
- Metadata bản nháp video6:08:3.399.337.725byte/MOV/3402×1916/progress0. Chưa xác định ngoại lệ gốc, chưa báo sửađược chính tệpnày.
- PR https://github.com/MinhTriDiamond/funprofile-supabase/pull/74 ; Previewcode72a83eb đạt https://d04bf4e3.funprofile-supabase.pages.dev . Hồ sơ docs/video-upload-10gb-2026-11-24/. Cổng Preview đúnghead cuối trước merge; backend3function triển khai sau merge, giữ auth. Trạng thái merge/deploy cuối xem PR.


## 2026-11-24 · BỔ SUNG HỒ SƠ PHÁT HÀNH VIDEO 10 GiB

- Tiếp nối phạm vi upload đã báo Telegram và PR #74; nhánh docs/quangvu-video-upload-release từ main đã merge c23c44e.
- Chỉ bổ sung hồ sơ xác minh production và thư kết quả: source tải lại 3 function khớp; auth giữ nguyên; theo dõi cùng lượt tải video 3.399.337.725 byte đã được Cha xác nhận tối đa 3 lượt kiểm tra. Không thay code/backend hoặc khởi tạo thêm upload trong nhánh hồ sơ.


## 2026-11-24 · HOÀN TẤT PHÁT HÀNH VIDEO 10 GiB VÀ THỬ TỆP LỖI THẬT

- PR #74 đã merge c23c44e và lên fun.rich; bundle index-CmHv55iG.js. Backend multipart-upload v88, create-post v88, get-upload-url v89 ACTIVE; JWT false/false/true giữ nguyên, source tải lại khớp repo.
- Đúng video MOV 6:08 trong ảnh, 3.399.337.725 byte, đã tải thành công 65/65 phần; server completed, giao diện hết lỗi và bật nút Post. HEAD R2 đúng dung lượng, GET Range 206 đúng 1.024 byte/tổng kích thước. Giữ bản nháp, không đăng bài.
- 55/55 test, tsgo/build/review/Preview đạt; mô phỏng multipart 10 GiB và hash đầy đủ 10 GiB đạt. Chưa upload tệp 10 GiB thật qua mạng. Tài khoản Cha vốn có mức admin 10 GiB, không quy lỗi ban đầu cho hạn mức 2 GiB.
- Hồ sơ kết quả/khôi phục: docs/video-upload-10gb-2026-11-24/README.md. PR code: https://github.com/MinhTriDiamond/funprofile-supabase/pull/74 . Nhánh docs/quangvu-video-upload-release chỉ bổ sung hồ sơ phát hành.


## 2026-11-24 · BẮT ĐẦU KHẢO SÁT XỬ LÝ VIDEO NỀN

- Quang Vũ cùng Angel Muse; Cha xác nhận đã gửi thông báo Coordinator cho tính năng mới.
- Nhánh: feat/quangvu-background-video-processing từ origin/main mới nhất.
- Phạm vi giai đoạn này: khảo sát upload R2/Create Post/player, luồng Stream hiện có, khả năng chạy chuyển mã và thiết kế hàng đợi/kiểm chứng/giữ bản gốc. Tài liệu thiết kế tại docs/superpowers/specs/.
- Hiện trạng: video MOV 6:08, 3,40 GB đã upload thành công nhưng giữ nguyên dung lượng; cần bản phát nhẹ hơn. Quota Stream từng chặn RTMP nên phải tính riêng khả năng lưu/transcode.
- Chưa sửa code sản phẩm, schema, secrets hoặc production; chưa xóa nguồn, chuyển video sang nhà cung cấp mới hay đăng ký dịch vụ trả phí. Chốt phương án và thiết kế trước triển khai.

- Kết quả khảo sát: Create Post ghi URL/size gốc vào post_attachments; multipart chưa enqueue chuyển mã. videoCompression.ts dùng Canvas/MediaRecorder trong LiveHostPage, không phải dịch vụ nền độc lập. optimize-storage chỉ tối ưu ảnh. Chưa thấy worker FFmpeg bài viết hoặc cấu hình triển khai worker này trong repo.
- Ràng buộc chính thức đã đối chiếu: Supabase Edge Functions memory256MB/CPU2s nên không làm encoder10GiB tại đây; Media Transformations giới hạn input100MB/output60s nên không phù hợp. Stream chuyển mã sẵn nhưng dùng quota phút chung và có phí phút lưu/phát. Hai hướng cần Cha chọn: worker chuyên dụng + R2, hoặc Stream managed. Chưa chọn nhà cung cấp, chưa bật dịch vụ trả phí, chưa thay production.

- Cha đã chọn Cloudflare Stream. Đã viết bản thiết kế chờ duyệt tại docs/superpowers/specs/2026-11-24-background-video-processing-design.md; có builder-check độc lập. Đề xuất giữ upload R2 rồi nhập Stream, phát thích ứng, bảo vệ webhook/cleanup/ownership, quota RTMP dự trữ240phút; giữ gốc7ngày và backup MP4 tối ưu30ngày là đề xuất, dọn thật tách bước. Không code/triển khai trước khi duyệt thiết kế.


## 2026-11-24 · CHA CHỐT STREAM TẠM → R2 LÂU DÀI → DỌN STREAM

- Cha xác nhận rõ bản tối ưu phải đưa về R2 để phát feed lâu dài, rồi dọn VOD tạm trên Stream sau xác minh. Cập nhật thiết kế thay cho bản lưu Stream lâu dài.
- Output MP4 R2 là media chính, không TTL30ngày. Tệp gốc R2 chưa có chính sách xóa được duyệt nên mặc định giữ; không tự áp mốc7ngày. V1 canary/bài public, không quét video cũ hoặc đổi RTMP.
- Phạm vi bổ sung cần thiết: export MP4 ready, transfer multipart có checkpoint, xác minh R2, publish đồng bộ và dọn Stream đúng thứ tự; lập kế hoạch tại docs/superpowers/plans/2026-11-24-background-video-processing.md. Chưa sửa code sản phẩm/production.

- Builder-check bản R2 phát hiện đổi privacy sau publish. Bổ sung kế hoạch output luôn ở bucket R2 private và gateway kiểm quyền hiện tại cho mọi GET/HEAD/Range/download; không khóa thao tác đổi privacy, không đưa service-role key sang Worker. Provision bucket/route/secret là bước hạ tầng review riêng trước bật. Kế hoạch gồm8task, chưa code sản phẩm.


## 2026-11-25 · CHA DUYỆT KẾ HOẠCH, BẮT ĐẦU TRIỂN KHAI NATIVE

- Cha duyệt kế hoạch Stream tạm → R2 lâu dài → dọn Stream và giao bé tự triển khai trong phiên này; tiếp tục nhánh feat/quangvu-background-video-processing đã báo Telegram.
- Thực hiện8task theo TDD, ledger riêng; chưa bật production hoặc xóa nguồn. Hạ tầng bucket private/gateway/secret, schema và canary sẽ được chuẩn bị cụ thể trước bước phát hành.

### 25/11/2026 — Cập nhật phạm vi sau review pipeline video nền

- Nhánh: `feat/quangvu-background-video-processing`; tiếp tục việc Cha đã duyệt và thông báo Telegram.
- Review toàn nhánh phát hiện các cổng cần siết trước canary: VOD Stream phải private, quyền đọc job chỉ gồm trạng thái, canary không vượt công tắc dọn, kiểm tra lại quota trước CREATE, khóa ETag nguồn và đồng bộ đường sửa video với attachment/media feed.
- Phạm vi bổ sung cần thiết: tab Video ở `src/pages/Profile.tsx`, preview trong `EditPostDialog.tsx`, migration đồng bộ chỉnh sửa, kiểm thử runtime workerd thật. Hai điểm phát này cần cấp quyền như feed khi dùng bucket private.
- Hiện trạng: chưa đổi production, chưa tạo import Stream thật, chưa dọn nguồn. Giữ các cổng hạ tầng/Preview/canary trước bật rộng; không có TTL cho R2 output hoặc tự xóa bản gốc.

### 25/11/2026 — Bổ sung phạm vi fixture kiểm thử để qua cổng toàn repo

- Nhánh giữ nguyên. Lượt toàn repo: 23 test lỗi/10 file, gồm các test LIVE không có DNS trong sandbox, một kiểm tra grep timeout khi chạy song song và fixture wallet thiếu `supabase.rpc` cho import chat hiện hữu.
- Chỉ bổ sung mock còn thiếu trong `src/components/wallet/__tests__/prices-unavailable.render.test.tsx`, không đổi logic wallet/chat. Chạy lại bộ offline có giới hạn worker, báo riêng test online chưa chạy được; không gộp lỗi mạng vào kết quả chức năng video.

### 25/11/2026 — Canary phát hiện lỗi tại bước lấy MP4 xuất
- Bé Quang Vũ tiếp tục phạm vi background video trên nhánh `fix/quangvu-background-video-rollout`; PR76 đã merge/main3bee820, hạ tầng triển khai và cờ đại trà OFF.
- Canary đúng video đã được Cha duyệt đã chuyển đủ3.399.337.725bytes, Stream chuyển mã xong; bước `mp4_wait` gặp lỗi và có retry. Chưa publish locators mới, chưa xóa VOD, giữ original.
- Phạm vi tiếp theo: bổ sung chẩn đoán an toàn theo từng ranh giới export/API/HEAD, không log token/TUS URL/nguồn; tìm nguyên nhân thực tế rồi test RED→GREEN và qua Preview trước deploy bản sửa. Không bật rollout khi cổng runtime chưa đạt.
- Cập nhật cổng công cụ: automatic approval review từ chối khởi chạy lệnh commit vì hết hạn mức, báo thử lại11:05; đây là review failure, không phải kết luận hành động unsafe. Commit/push/deploy diagnostic CHƯA thực hiện. Không đi vòng cổng duyệt.
- Kiểm chứng local patch:652test offline pass/53skip,103files; tsgo/Deno check/build pass; reviewer không có Critical/Important, allowlist status đã có RED→GREEN. Code/metadata phát hành hiện có chưa giải quyết lỗi canary; không báo hoàn tất.

### 25/11/2026 — Xác nhận nguyên nhân export canary, sửa tương thích exp
- Bộ duyệt đã hoạt động lại; PR77 merged main `f671904`, Preview đúng commit `24534f8` render thật đạt tại https://83a5c253.funprofile-supabase.pages.dev. Đã deploy process-post-videos diagnostic.
- Probe VOD canary xác nhận: private/owned=true, MP4ready, trusted URL, subjectMatches=true, downloadable=true; `exp` là string có giá trị thời gian tương lai, bị validator từ chối ở `signed-url-validation`. Không xuất token/URL.
- Nhánh riêng tiếp theo `fix/quangvu-video-export-runtime`: chỉ chuẩn hóa NumericDate decimal-string có kiểm tra safe integer/future, giữ kiểm UID/downloadable/host; test lỗi thực tế RED→GREEN, Preview trước merge/deploy, tiếp tục đúng job cũ. Cờ đại trà/xóa vẫn OFF.

### 25/11/2026 — Token đã qua, phát hiện chuyển hướng MP4
- PR78 merged main `01f6f5a`, Preview8d435bc render thật đạt; đã deploy process-post-videos. Probe thật xác nhận signedUrlValid=true với exp string.
- Ranh giới kế tiếp: HEAD endpoint MP4 trả302 có Location, chưa có kích thước. Tác vụ chưa được resume/publish/delete. Nhánh `fix/quangvu-video-rollout-results` tiếp tục phạm vi canary: hỗ trợ chuyển hướng hữu hạn, giữ allowlist host/path/UID và timeout chung; nếu provider chuyển sang host ngoài allowlist phải dừng/đối soát, không nới quyền đoán.
- PR79 merged main `8e5c1bd`, Preview837a0ad render thật đạt. Probe đích302 xác nhận cùng origin `customer-bsht0z0p42aa9o2u.cloudflarestream.com`, path chứa đúng UID; không xuất path/query/capability.
- Nhánh `fix/quangvu-private-export-redirect`: sửa theo bằng chứng thực tế, tối đa3redirect, cùng origin ban đầu, mỗi hop validate host/path/UID, deadline chung20sHEAD/45sRange và không Referer. Host/path/UID khác sẽ fail closed; không tự mở bucket/CDN ngoài allowlist.
- PR80 merged main `60e100e`, Preview677c8ae render thật đạt, đã deploy. Probe vẫn fail closed ở resolution; bản chẩn đoán trước chỉ ghi hop đầu nên chưa chỉ ra hop/path nào bị chặn. Chưa resume/publish/delete.
- Nhánh `fix/quangvu-video-canary-results` bổ sung trace tối đa3hop đã che toàn bộ đoạn path opaque/UID/query và mã lỗi allowlist; không đổi chính sách chuyển hướng. Sẽ dùng bằng chứng hop thật trước khi sửa ranh giới kế tiếp.

### 25/11/2026 — Chốt ranh giới đường dẫn opaque của provider
- PR81 merged main `7473284`, Previewfabc38d render thật đạt. Đã deploy trace/Range diagnostic.
- Trace thật xác nhận cả HEAD và GET bị validator path chặn ngay hop đầu: cùng origin Stream, đúng UID, hình dạng `/<video>/<opaque>/default.mp4`. Không ghi đoạn opaque/query/capability.
- Nhánh `fix/quangvu-export-provider-path` hỗ trợ riêng Location do yêu cầu ký hợp lệ trả về: cùng origin, UID segment chính xác, chỉ một đoạn opaque URI an toàn/giới hạn, basename `default.mp4`. Giữ tối đa3hop, deadline chung; URL opaque không được chấp nhận làm nguồn đầu vào hay lưu vào DB/log. Sẽ kiểm token/HEAD/Range thật trước resume job cũ.

### 25/11/2026 — Canary đã qua export, chuyển đủ MP4 R2
- PR82 merged main `5c38266`, Preview7db6375 render thật đạt. Probe thật: resolvedHEAD200/110.367.516bytes, GETRange206 đúng1byte; tokenprivate/UID/downloadable đều đạt. Nguồn3.399.337.725bytes, MP4giảm96,75%.
- Đã resume riêng job02e100d1... từmp4_wait bằng guard owner/post/source/UID/phase; không tạo import. Đang R2verify, deleteOFF.
- Source audit phát hiện2bundle phụ thuộc còn bản postVideoTransfer cũ: post-video-read và stream-webhook. Đồng bộ đúng source đãmerge5c38266 trong phạm vi8function đãđăngký, kiểmDeno trước deploy; không đổisecret/config/flags.

### 25/11/2026 — Sửa cổng tham chiếu theo quy mô production
- Canary MP4R2 đã phát/tua/gia hạn và tải đủ110.367.516bytes; full decode không lỗi, thời lượng367,552s/H2641916x1080/AACstereo48kHz. Testprivate/friends đạt và đã trảpublic; rehearsal khôi phục rollback-only đạt.
- Dry-run trướcxóa timeout145s. Counts production:209.807posts,62.167attachments,112.068comments,1.767profiles,11.273replays,11.329sessions. Hàm hiện tại phântrang toàn bộ để tìmUID, gây hàngtrămHTTPcalls.
- Nhánh `fix/quangvu-video-release-evidence`: bổ sung migration `20261125050000_post_video_reference_probe.sql`, RPC SECURITYINVOKER chỉservice_role trảboolean, giữ toàn bộ trường thamchiếu/own-job exclusion; Edge gọi mộtRPC bounded45s, lỗi/NULL vẫnfailclosed. Thêm statusHTTPStream và probeownership rõ404≠403 để kiểm hậu xóa. Đã thấy RED fullrowexport/undefinedSQLfunction/missingstatushelper; fixtureloopback và unit hiện GREEN; chưaapply/deploy. Không xóaVOD khi cổng chưađạt.

### 25/11/2026 — Kết quả production background video
- PR76–83 đãmerge; runtime mained6f0de, từngcổngPreviewđúngcommit renderđạt. Năm migration/támfunction/Workercron đãtriểnkhai; source8index+53shared khớp.
- Canary3.399.337.725→110.367.516bytes (-96,753%),367,552s1080p/AAC. Desktop/mobilemôphỏng,seek/renew/downloadđủ,private/friends/recoveryđạt. VODStreamđúngjob đãxóa/404; R2HEAD200/Range206,originalcòn. Stream6,13→0,01/1.000phút.
- Cổngthamchiếu đãchuyển thànhRPCservice-only30s, dry-run7,7s thaytimeout145s. Admission10GiB/overlimit vàcronđộc lập đãkiểm.
- Đãbật4cờproduction lúc15:26ngày25/11giờAsia/Kuala_Lumpur, reserve240phút. 18releasegatesđạt. Chỉvideo publicmới đủđiềukiện; khôngbatchbàicũ/khôngxóaoriginal. Hồsơ docs/background-video-processing-2026-11-24; rollbacktắtcờ/giữR2/phục hồinguồnselective.

### 25/11/2026 — TRƯỚC: lưu nguồn video 24 giờ rồi dọn
- Cha đã đồng ý chính sách và xác nhận gửi Telegram. Bé Quang Vũ triển khai trên `feat/quangvu-video-original-retention-24h` từ main mới nhất.
- Phạm vi: migration/RPC lease và chặn tham chiếu mới khi bắt đầu dọn; processor/cron xóa nguồn R2 có điều kiện ETag sau24h kể từ publish tối ưu; kiểm lại output và tham chiếu trước xóa; trạng thái/audit/khôi phục. Giữ output lâu dài, không dọn job lỗi/chưa publish/không lợi ích. Video canary đã tối ưu thuộc phạm vi chính sách mới; không xóa sớm hoặc xóa nguồn khác ngoài jobs đủ điều kiện.
- Thực hiện test logic/SQL, Preview đúngcommit trước merge; rollout giữ cờ dọn nguồn OFF đến khi kiểm chứng canary/dry-run đạt. Sau khi xóa nguồn không thể khôi phục chất lượng gốc, metadata backup chỉ phục vụ đối soát.
- Kiểm tra local:707testofflinepass/53skip, SQL/RLS/lease/tombstone vàrace hai kết nối bằngtrigger thật đạt; tsgo/Deno/build đạt. Queryfullref read-only production đo32,33s sau tốiưu tránhJSON2lần; sourceRPC/arm timeoutriêng55s/HTTP65s, khôngđổi role/global. Self-reviewcủatácgiả theo checklist, khôngghi làreviewđộclập.
- Canary hiện tại publish13:28ngày25/11, due13:28ngày26/11giờKualaLumpur. Cờ nguồn chưa bật; khôngxóa sớm. Metadata canary và3bundle production được snapshot trướcdeploy; khôngbackup toànfile gốc để tránh tốn dung lượng nhưChađãduyệt.
- Tệp khóa cron tạm của phiên trước đã bị dọn. Trongrollout sẽ chỉ đồngbộ lại khóa cronchuyên dụng qua Supabase/Workersecretmanager, giữ nguyên read/gatewaysecret, khôngnớiquyền vàkhôngđưasecretvàoGit/chat/log.

### 25/11/2026 — SAU: đã bật chính sách nguồn 24 giờ
- PR85 merged runtime513e599; Previewd72bc67 thật đạt tại https://5716f193.funprofile-supabase.pages.dev. Migration25060000 đãapply/ghi history, ACLservice-only/7guards/timeout55s xácminh;3bundle44file source khớp.
- Source-dry-run26,8s đạt: due=false, original/output verified, publication_current=true, referenced=false. Tệp giả1KiB xóa/404 đạt. MP4R2vẫnHEAD200/Range206; endpointretentiontừchốianon401. ĐồngbộduynhấtcronsecretquaSupabase+Worker, read/gatewaykhôngđổi.
- Đã bật original_delete_enabled lúc17:46ngày25/11giờKualaLumpur;4cờtốiưucũvẫnTRUE,reserve240. Tickthậtbỏquacanarychưatớihạn, attempts0/source_delete_started_atNULL/source_deleted_atNULL. Video3,40GBđủ24h từ13:28ngày26/11/2026, khiđócònphảiquakiểmtra antoàn; khôngbáođãxóanguồnhiệntại.
- Tests707offline/53skip/105files,SQLlease/ACL/tombstone/race2connection,tsgo/Deno/buildđạt. Selfreviewcủatácgiả, khôngreviewđộclập. Hồsơ/rollback:docs/video-original-retention-2026-11-25. Sau khi nguồn đã xóa khôngkhôiphụcchấtlượnggốctừmetadata;MP4tốiưulưu lâudài.

- Quan sát Worker scheduled event sau đồng bộ khóa: cron `* * * * *`, outcome `ok`, đúng active version `cac49a22-2349-4918-bf95-22888eb8f02b`; không cần mở trình duyệt. Hồ sơ chỉ giữ trường scheduled, không giữ HTTP headers/cookie.

### 25/11/2026 — TRƯỚC: tải video tối ưu không ổn định
- Cha xác nhận đã gửi thông báo Telegram. Bé Quang Vũ kiểm tra trên `fix/quangvu-optimized-video-download` từ main mới nhất.
- Hiện trạng: Chrome báo gián đoạn tải video.mp4 trên profilehappycamlycoin, lúc được lúc không. Chưa kết luận do Internet hay ứng dụng.
- Phạm vi: đường đi nút Tải video ở feed/gallery/profile, authorization/cookie, thời hạn và Range/resume, luồng R2 Worker; tái hiện bằng tải thật và mạng chậm/gián đoạn. Không xóa/sửa video, bài viết hoặc chính sách lưu nguồn24h. Sửa theo bằng chứng, test/typecheck/Preview trước merge; thayproductionWorker/function phải có snapshot và receipt/rollback.
- Đã tái hiện native Chrome tải bị hủy với nguồn tối ưu110.324.802bytes trên profile trong ảnh. Direct GET nhận đủ, Blob/static native tải được; test cùngtab/tabmới đều fail. Worker tail lọc riêng referer của phiên thử xác nhận downloadGET=`exceededCpu`, không phải kết luận từ thông báo Internet.
- Phạm vi sửa đã chốt: bỏ TransformStream JavaScript đếm từngchunk trước FixedLengthStream (native đã kiểm đủ/thiếu bytes), dùng pipe native R2→FixedLength. Giữ nguyên auth mỗi yêu cầu, cookie5phút, Range, privatebucket và policynguồn24h. Không tăng gói/CPUlimit hay mởpublic video. Kiểm workerd thiếu/thừa body, native download đủtệp nhiều lần và Range/resume trước/sau expiry; source/delivery không thay đổi.

### 25/11/2026 — SAU: tải video tối ưu
- PR #87 đã merge `0467b92`, nhánh sửa đã xóa. Preview `https://c73c8383.funprofile-supabase.pages.dev` render bình thường. Bỏ JS transform theo chunk, dùng FixedLengthStream native giữ kiểm byte.
- Đã triển khai Worker `03b86c2f-1c7a-4047-b2db-9ca491ce2734`; route, private R2, cron và quyền/TTL không đổi. Snapshot và rollback về `cac49a22-2349-4918-bf95-22888eb8f02b` đã lưu; không sửa/xóa video hoặc chính sách giữ nguồn 24h.
- Trước sửa native tải canceled và tail xác nhận exceededCpu; sau sửa 3/3 native tải đủ 110.324.802 byte; nút Tải video thật trên profile cũng đủ byte. Hai Range nối tiếp 8 MiB đều 206/cùng ETag. Chưa kiểm UI Tiếp tục Chrome sau mất mạng thật.
- 708 test offline đạt/53 skip, tsgo/build/dry-run đạt; workerd GET/206 và body thiếu/thừa đạt; browser local kiểm expiry/renew/revoke đạt. Self-review tác giả, không review độc lập. Hồ sơ: docs/optimized-video-download-2026-11-25.

### 25/11/2026 — TRƯỚC: cảnh báo rời bài đang soạn
- Cha đã xác nhận gửi Telegram. Bé Quang Vũ thực hiện trên nhánh `fix/quangvu-unsaved-post-warning` từ main mới nhất.
- Phạm vi: kiểm tra composer đăng bài/video; xác nhận đóng khi còn nội dung/media hoặc đang đăng, beforeunload khi đóng tab/reload; tránh cảnh báo khi trống/đã đăng thành công; giữ cơ chế nháp hiện có. Kiểm thử, typecheck và Preview trước merge. Không thay đổi backend hoặc tự đăng bài thật.

### 25/11/2026 — SAU: cảnh báo rời bài đang soạn
- PR https://github.com/MinhTriDiamond/funprofile-supabase/pull/89 đã merge `1ce86df`; nhánh sửa đã xóa. Preview đúng commit `fe843d6`: https://06e7457f.funprofile-supabase.pages.dev render bình thường trước merge. Cloudflare Pages phát hành từ main.
- Giữ loading/cảnh báo đóng tab đến khi server xác nhận, kể cả dialog đã tự đóng để gửi nền; vẫn cảnh báo khi media tiếp tục upload sau lưu nháp/đóng. Không cảnh báo thừa khi trống hoặc đăng xong.
- Đóng khi đang gửi có giải thích và lựa chọn ở lại; bản chưa đăng giữ lựa chọn tiếp tục/lưu nháp/bỏ, nói rõ nội dung sẽ mất nếu bỏ. Nút quay về nhiệm vụ qua cùng xác nhận; lưu nháp lỗi giữ nội dung và không báo thành công.
- 6 test composer đạt; toàn bộ 714 test offline đạt/53 skip/106 file, tsgo và build đạt. Chrome local chạy composer thật/backend giả xác nhận reload, đóng tab rồi dismiss giữ trang, xác nhận đóng dialog, reload khi gửi nền, và gỡ cảnh báo sau thành công. Không đăng bài production. Self-review bởi tác giả, không review độc lập.
- Cảnh báo native do Chrome quyết định nội dung; không bảo đảm khi OS buộc tắt app/mobile. Giữ cơ chế nháp hiện có. Hồ sơ và rollback: docs/unsaved-post-warning-2026-11-25; không thay backend/storage/secrets.

### 26/11/2026 — TRƯỚC: giao diện webcam live desktop
- Cha xác nhận đã gửi Telegram. Bé Quang Vũ thực hiện nhánh `feat/quangvu-desktop-webcam-live` từ main mới nhất.
- Phạm vi: màn hình chuẩn bị và host webcam trên desktop theo ảnh Facebook Live Producer: cột thiết lập, preview đúng tỉ lệ, điều khiển/bình luận riêng; giữ mobile. Không tự phát live production; không đổi pipeline RTMP/backend/quota/lưu video. Kiểm chứng responsive, camera/mic với fixture local, typecheck/build và Preview trước merge.

### 26/11/2026 — SAU: webcam live desktop
- PR https://github.com/MinhTriDiamond/funprofile-supabase/pull/91 đã merge `0542d52`, nhánh tính năng đã xóa. Preview đúng head `5156ae2`: https://55bfab21.funprofile-supabase.pages.dev; Chrome render bình thường, bundle PreLivePage/LiveHostPage HTTP200 có marker layout desktop. Cloudflare Pages phát hành từ main.
- Setup desktop tách cột chi tiết/micro/chất lượng/âm thanh, preview16:9 giữ trọn hình, nút bắt đầu luôn thấy. Host desktop có ba vùng điều khiển/video/bình luận, cuộn riêng, không còn ép preview min-height420px; CSS ưu tiên hơn SDK inline cover. Mobile dưới1024px giữ UI hiện có.
- Camera giữ cùng stream khi resize; mic đã tắt không tự bật sau đổi chất lượng; sửa thứ tự hook responsive của host. Không thay backend/RTC/RTMP/ghi replay/quota/storage; không phát live production.
- Kiểm chứng Chrome với media giả/backend local: 1024/1440/1920 không overflow, preview16:9, chat trong viewport; mobile390 và resize qua lại không lỗi hooks. Callbacks mic/chat/end, payload mô tả/chất lượng đạt. 717 test offline đạt/53 skip/107 file, tsgo và build cuối đạt. Self-review tác giả, không review độc lập. Ảnh, số liệu và rollback: docs/desktop-webcam-live-2026-11-26.

### 26/11/2026 — TRƯỚC: bình luận live bị trùng
- Cha xác nhận đã gửi Telegram. Bé Quang Vũ thực hiện nhánh `fix/quangvu-live-comment-duplicate` từ main mới nhất.
- Phạm vi: luồng gửi, phản hồi/realtime, optimistic state và hiển thị chat host/viewer; chống gửi trùng do Enter/nút gửi, kiểm thử đua dữ liệu. Không tự gửi bình luận lên live production, không xóa bình luận hoặc ngắt live. Typecheck/build/Preview trước merge.

### 26/11/2026 — SAU: bình luận live bị trùng
- PR https://github.com/MinhTriDiamond/funprofile-supabase/pull/93 đã merge `009d196`; nhánh sửa đã xóa. Preview đúng head `f7b3b59`: https://3b828e95.funprofile-supabase.pages.dev render bình thường, shared live bundle HTTP200 có phần xác nhận canonical mới. Cloudflare Pages phát hành từ main.
- Read-only đúng live trong ảnh xác nhận2row khác ID/cùng người và text, lệch34ms. Thêm khóa đồng bộ trước auth/INSERT và nút chờ, lọc Enter IME/repeat ở host desktop/viewer/chat. Hòa giải optimistic/response/realtime theo server ID, history chậm không ghi đè row mới; không đưa phản hồi session cũ vào live mới.
- Chrome với chat/hook thật và backend giả: Enter liên tiếp+realtime lặp→1write/1dòng/count1; gửi lại có chủ ý sau hoàn tất→2write/count2. 10 regression test, toàn bộ727 test offline đạt/53 skip/109 file, tsgo/build đạt. Self-review tác giả, không review độc lập.
- Không gửi/xóa bình luận production, không ngắt live, không sửa schema/quyền/backend. Hai row cũ vẫn là hai bình luận đã lưu; không gộp theo text làm mất bình luận lặp chủ ý. Hồ sơ/receipt/rollback: docs/live-comment-duplicate-2026-11-26.

### 27/11/2026 — TRƯỚC: layout bài nhiều video
- Cha xác nhận đã gửi Telegram. Bé Quang Vũ kiểm tra bài Father và sửa trên `fix/quangvu-multi-video-layout` từ main mới nhất.
- Phạm vi: media feed/profile cho bài3video, một video lớn trên/hai video dưới, khe ngăn nhỏ, bỏ khoảng trắng thừa; kiểm responsive và mở/phát từng video, giữ thứ tự/dữ liệu. Không đăng/sửa/xóa bài hoặc thay pipeline video. Typecheck/build/Preview trước merge.

### 27/11/2026 — SAU: layout bài ba video
- PR https://github.com/MinhTriDiamond/funprofile-supabase/pull/95 đã merge `c518413`; nhánh sửa đã xóa. Preview đúng commit `9101f96`: https://36e65075.funprofile-supabase.pages.dev đã kiểm bài Father trước merge. Cloudflare main check success; kiểm lại đúng bài trên https://fun.rich/father đạt.
- Bài `40b3b9ea-c03a-4676-9c2e-3e39a4aa2be1` có đúng3video. Một ô lớn trên, hai preview bằng nhau dưới; browser production đo khe1px, phần trống cuối lưới0px. Giữ nguyên thứ tự/tệp và pipeline; không sửa/xóa bài hoặc video.
- Chrome local kiểm390/768/1440px, video ngang/dọc, mở/phát từng video, bàn phím và dừng video nền. 727 test offline đạt/53 skip/109 file, tsgo/build đạt. Self-review tác giả, không review độc lập. Hồ sơ/receipt/rollback: docs/multi-video-layout-2026-11-27.

### 27/11/2026 — TRƯỚC: bố cục bài nhiều ảnh
- Cha xác nhận gửi Telegram. Bé Quang Vũ thực hiện nhánh `fix/quangvu-photo-grid` từ main mới nhất.
- Phạm vi: nhóm chỉ ảnh trong MediaGrid, bố cục1/2/3/4/5+ảnh và giữ trọn hình ở feed/profile/gallery; kiểm desktop/mobile. Không sửa dữ liệu/ảnh gốc, không đổi nhóm video hoặc media hỗn hợp. Typecheck/build và Preview trước merge.

### 27/11/2026 — SAU: bố cục bài nhiều ảnh
- PR https://github.com/MinhTriDiamond/funprofile-supabase/pull/97 đã merge `d4fb8a9`; nhánh sửa đã xóa. Preview đúng head `9f83117`: https://06ab08cb.funprofile-supabase.pages.dev; đã mở trực tiếp bài `39c32ed1-3c87-4e90-82ab-144da409a9fc` và xem ảnh chụp thật trước merge. Main tự triển khai qua Cloudflare Pages.
- Nhóm1/2/3/4/5+ảnh có bố cục riêng;3ảnh một lớn trên/hai dưới. Bỏ crop từ preset CDN và CSS cho nhóm chỉ ảnh, có nền đệm khi khác tỉ lệ; giữ trọn ảnh và thứ tự/gallery. Không sửa dữ liệu hoặc nhóm video/mixed.
- Bài thật Preview:3ảnh loaded, contain cả3, không dùng CDN fit cover/crop, ô đầu606px toàn chiều ngang, hai ô dưới302,5px, phần trống cuối0px. Chrome mô phỏng18case responsive và mở ảnh6 qua gallery đạt. 727test offline/53skip, tsgo/build đạt. Self-review tác giả. Hồ sơ/rollback: docs/photo-grid-2026-11-27.

### 27/11/2026 — TRƯỚC: kiểm tra xóa nguồn3,40GB
- Cha xác nhận gửi Telegram. Bé Quang Vũ thực hiện `docs/quangvu-original-deletion-check`.
- Chỉ đọc đúng job canary02e100d1-e568-4ab0-a178-33a5ee791c46: trạng thái/receipt dọn nguồn, HEAD nguồn R2 và HEAD/Range bản tối ưu. Không kích hoạt tick, không probe tạo/xóa, không thay cấu hình/dữ liệu. Ghi kết quả vào hồ sơ.

### 27/11/2026 — SAU: xác nhận nguồn3,40GB đã xóa
- Kiểm tra chỉ đọc job02e100d1-e568-4ab0-a178-33a5ee791c46 lúc15:24ngày27/11giờKualaLumpur: source_deleted_at=26/11/2026 13:29:20,857812; có receipt, nguồn3.399.337.725byte, lỗiNULL. Dọn sau hạn24h khoảng48giây; không chạy DELETE/tick mới.
- Bản tối ưu110.367.516byte vẫn gắn đúng attachment, HEAD200/Range206/ftyp đạt. Stream tạm đã xóa25/11/2026 14:05:18,98. Source-dry-run: sourceDeleted=true, currentPublication/outputVerified=true, referenced=false. Receipt xóa chỉ được ghi sau kiểm originHEAD404 theo runtime; không coi CDN cache là storageorigin.
- Không sửa dữ liệu/cấu hình hoặc tạo probe. Hồ sơ: docs/original-deletion-check-2026-11-27. Chỉ PR tài liệu; mã vận hành không thay đổi.

### 27/11/2026 — TRƯỚC: rà soát/tối ưu tuần tự video cũ
- Cha duyệt và xác nhận gửi Telegram. Bé Quang Vũ thực hiện nhánh `feat/quangvu-backfill-old-videos`.
- Phạm vi: inventory read-only toàn bộ video feed và bản ghi webcam cũ, loại RTMP bằng provenance live_sessions/metadata; snapshot metadata trước ghi. Tối ưu lần lượt từng nguồn đủ điều kiện bằng Stream tạm→R2private→dọn Stream, chỉ publish khi nhỏ hơn/đã xác minh/quyền xem đúng; giữ nguồn24h rồi dọn bằng policy hiện có. Không xử lý nguồn không rõ loại/đang live/thiếu quyền hoặc làm trùng job.
- Có thể bổ sung công cụ admission/backfill có allowlist và checkpoint nếu pipeline hiện tại chưa hỗ trợ nguồn cũ/webcam. Không tự đổi public/private, không batch DELETE. Test/Preview trước merge code; hồ sơ từng video và rollback trước publication.

- Cập nhật phạm vi sau inventory:9.362bài/9.395mục nguồn;724RTMP bị loại (bao gồm228bài metadata RTMP mâu thuẫn session webcam),3.340ứng viên feed,772webcam có lineage Stream/R2 và4.177webcam cần đối chiếu thêm. Bổ sung queue service-only/lease/admission từng nguồn trong cron hiện có, cờ mặc địnhOFF; snapshot seed và rollback trước bật. Không xếp hàng RTMP/nguồn mơ hồ. Video feed đầu tiên37.481.012byte đã admission bằng pipeline hiện hữu sau snapshot, không canary, output dự kiến33.567.165byte chưa publish tại thời điểm ghi.

### 27/11/2026 — SAU: đã bật hàng đợi video cũ, batch còn chạy
- PR https://github.com/MinhTriDiamond/funprofile-supabase/pull/100 đã merge `7163400`, nhánh đã xóa. Preview đúng head `714ae3a`: https://482c90d4.funprofile-supabase.pages.dev đã render. Migration `20261127090000` có history/RLS/service-only; snapshot function và flags trước deploy. Ba file runtime tải lại khớp hash main.
- Bật lúc 16:09:04 ngày 27/11, giờ Kuala Lumpur: 7.515 mục gồm 3.340 feed và 4.175 webcam. Đối chiếu không có RTMP theo metadata/session/key; kiểm thêm mode/live-input/config đều 0. Seed 38 gói khi OFF, idempotent; request lớn đầu tiên trả 413 trước thực thi SQL. Không thay Worker/cron/secrets hoặc các cờ tối ưu cũ; giữ dự phòng live 240 phút.
- Feed đầu tiên hoàn tất: 37.481.012 → 33.567.165 byte, tiết kiệm 3.913.847 byte; HEAD 200/Range 206/ftyp và Chrome thật phát 1280×720. VOD đã dọn; nguồn chưa xóa, giữ 24 giờ. Đã liên kết job vào checkpoint để tránh xử lý lại. Webcam smoke giữ nguyên H.264/AAC khoảng 0,95 Mbps, không tạo job/VOD. Cron tự nhận feed tiếp theo 4.015.205 byte; quan sát tối đa một job backfill hoạt động.
- 751 test offline đạt/53 skip/111 file; 16 guard SQL, hai kết nối chỉ một claim, authenticated thấy 0 row; tsgo/Deno/build đạt. Ba webcam thật đối chiếu parser/ffprobe. Self-review tác giả. Hàng đợi đã bật, chưa hoàn tất hàng nghìn video. Mục thiếu/đổi/không rõ để held/skipped; VOD hoặc import mơ hồ chặn nhận thêm để đối soát. Nguồn webcam còn tham chiếu ở live_sessions/live_replays vẫn được giữ.
- Hồ sơ/checkpoint/rollback: `docs/backfill-old-videos-2026-11-27`. Raw inventory/snapshot/seed giữ ngoài Git trong thư mục local riêng. Tắt `post_video_backfill_control.enabled` để ngừng admission mới; giữ jobs/snapshots/schema, không reset import mơ hồ.

### 27/11/2026 — TRƯỚC: composer desktop thoáng và xem trước
- Cha xác nhận đã gửi Telegram. Bé Quang Vũ thực hiện `feat/quangvu-desktop-post-composer` từ main mới nhất.
- Phạm vi: FacebookCreatePost và component preview, bố cục desktop hai cột soạn/xem trước, giảm khung lồng nhau, công cụ gọn và nút Đăng luôn thấy; giữ tablet/mobile, các callback tải media/lưu nháp/cảnh báo rời bài. Kiểm Chrome nhiều viewport, regression/typecheck/build và Preview trước merge. Không đăng bài production, không thay backend hoặc hàng đợi video đang chạy.

### 27/11/2026 — SAU: composer desktop rộng và xem trước
- PR https://github.com/MinhTriDiamond/funprofile-supabase/pull/102 đã merge `7ca46a2`; nhánh tính năng đã xóa. Preview đúng head `b9714a4`: https://720a8aaf.funprofile-supabase.pages.dev render bình thường, CSS desktop và bundle composer HTTP200 có marker mới. Cloudflare Pages tự triển khai từ main.
- Desktop từ1024px dùng hai cột soạn/preview cuộn riêng; header/nút Đăng luôn thấy. Thu gọn avatar/viền, thumbnail quản lý4cột, toolbar gọn và gợi ý/AI mở rộng. Preview cùng state text/privacy/context/media, giữ thứ tự và ảnh contain, không upload hoặc phát thêm video. Không đổi backend hoặc hàng đợi tối ưu video.
- Chrome fixture dùng component/CSS thật, backend giả:1024/1440/1920 không overflow, tablet768 và mobile390 một cột; gõ/3ảnh/private/remove/drop/AI đồng bộ; text dài cuộn preview600px; mobile cuộn500px tới media/công cụ. Đóng→tiếp tục giữ dữ liệu, native reload warning và lưu nháp text/private/3media đạt. Không đăng bài production.
- 753test offline đạt/53skip/112file,8test composer/preview đạt,tsgo và build22,24s đạt. Self-review tác giả, không review độc lập. Hồ sơ/ảnh mô phỏng/rollback:docs/desktop-post-composer-2026-11-27. Preview ứng dụng công khai và asset được kiểm online; composer có đăng nhập được kiểm bằng fixture local.

### 28/11/2026 — TRƯỚC: bản ghi RTMP trên4giờ
- Cha xác nhận đã gửi Telegram. Bé Quang Vũ thực hiện nhánh `fix/quangvu-long-rtmp-replay` từ origin/main.
- Kiểm tra chỉ đọc Stream UID `4641dfe88bdfaf390fdca77d5707cb26`, session/replay/post và đường archive R2; bổ sung xử lý nguồn live không xuất được MP4 trên4giờ nếu cần. Snapshot trước mọi thay đổi production; giữ nguồn Stream cho tới khi bản thay thế xác minh đầy đủ, không ngắt live. Không thay hàng đợi tối ưu video feed/webcam. Test và Preview trước merge; ghi hồ sơ/rollback.

- Cập nhật chẩn đoán/phạm vi: HLS video/audio đều14.554,1giây, ENDLIST; replay2dcca8db-db44-49b8-97cc-edf261682786 kẹt mp4_export HTTP400, chưa có R2. Phục hồi remux HLS→MP4 giữ codec; bổ sung endpoint tải multipart chỉ một replay/UID bằng capability có hạn, không xuất APIkeys, không cấp quyền xóa hoặc publish. Chỉ nối pipeline publication sau remote size/hash/decode xác minh. Thêm phân loại giới hạn MP4 live4giờ, bảo toàn Stream/HLS; chưa hứa tự remux mọi phiên dài tương lai.
