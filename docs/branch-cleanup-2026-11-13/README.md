# Rà soát nhánh — 2026-11-13

Người làm: Quang Vũ cùng Angel Muse. Cha xác nhận Telegram trước khi bắt đầu.

## Sao lưu và khôi phục

Đã tạo và verify bundle đầy đủ: `/private/tmp/funprofile-before-branch-cleanup-20261113.bundle`. Không chứa thay đổi untracked `supabase/.temp/`. Giữ nguyên thư mục tạm đó.

Khôi phục nhánh local từ bundle: `git fetch /private/tmp/funprofile-before-branch-cleanup-20261113.bundle refs/heads/<ten-nhanh>:refs/heads/<ten-nhanh>`.

## Đã xóa local

| Nhánh | SHA trước xóa | Bằng chứng |
|---|---|---|
| `docs/muse-live-feed-deployed` | `e213f5be525f1998e5c98b03723db0fb64d3918d` | Đã nằm trong origin/main |
| `fix/muse-live-feed-status` | `7c3b366f0571b34d566d6410ab58d9904f17a4f2` | Đã squash qua PR #55 / d03781f; diff với main chỉ còn 3 tệp hồ sơ kết quả, không có code riêng |
| `fix/quangvu-chat-call-hardening` | `67bf61122b7d8c50727d3aa24ad7131876071c7d` | Đã nằm trong origin/main |
| `fix/rtmp-no-video-auto-end` | `1c8328672adc3d352e667b2b8d627525eedd2012` | Đã nằm trong origin/main |

## Chưa xóa remote

Không lấy được inventory mới nhất: git fetch --prune lỗi DNS github.com; gh pr list không kết nối api.github.com; connector GitHub cũng lỗi transport. Không xóa nhánh remote khi chưa kiểm tra PR đang mở và đầu nhánh hiện tại. Danh sách dưới đây là cache local, KHÔNG khẳng định trạng thái hiện tại trên GitHub.

| Remote tracking ref | SHA cache | Có trong lịch sử main local |
|---|---|---|
| `origin/docs/aivan-dich-bai-viet-fix-ket-qua` | `90da35965d27b3e6b9a2cf029cf916a5970701ec` | Có |
| `origin/docs/aivan-dich-bai-viet-ket-qua` | `3d97375df0461be8d86a0076ac6cdac4d363c89c` | Có |
| `origin/docs/aivan-dich-chuan-ket-qua` | `a5609e80a55e5fa8a6c087b4725abf14c34e1ff6` | Có |
| `origin/docs/aivan-dich-thuat-ngu-ket-qua` | `147a49d708869be82303138cf393b532924e1db9` | Có |
| `origin/docs/aivan-thong-bao-ket-qua` | `cb575e0f4e9c696f0b313142c440a9b1ad8de6a5` | Có |
| `origin/docs/aivan-upload-crash-fix-result` | `8cd5a951d23b179f0a9bf0eb7bcb56a4ca1e3d1c` | Có |
| `origin/docs/tri-mailbox-9-close-recordings` | `c2be0ec0e4f4d8332386f963eac38cf0b5a72558` | Cần đối chiếu PR/squash/chưa merge |
| `origin/docs/tri-quy-trinh-coordinator` | `4710657835cc66672dfb4957b4c74882f871eb76` | Có |
| `origin/docs/tri-r2-recordings-cleanup` | `d973ab5a2dc2a62e0b9283c3496ca841a08ef2c2` | Cần đối chiếu PR/squash/chưa merge |
| `origin/feat/aivan-dich-bai-viet` | `5a222753b1d2293d5688b92c9145e58979e26b81` | Có |
| `origin/feat/aivan-stories-9-o` | `a854ccd161d11633bf282527e6e7c096bc8b5224` | Cần đối chiếu PR/squash/chưa merge |
| `origin/feat/aivan-them-4-bai-fath-uni-marquee` | `8cb273d0743a55a2287e52baf47b05739a938d77` | Cần đối chiếu PR/squash/chưa merge |
| `origin/feat/tri-donation-verification-flow` | `338340dfd2c82a23ac38812731b86e4160b26a15` | Cần đối chiếu PR/squash/chưa merge |
| `origin/feat/tri-privacy-policy-page` | `c94290303ecd3c7bafacc3427e500f1211a960a1` | Cần đối chiếu PR/squash/chưa merge |
| `origin/feat/tri-signup-captcha` | `ee8646ecd8905eb4a3f50f866a01d9b6f981b1c8` | Cần đối chiếu PR/squash/chưa merge |
| `origin/feat/van-signup-device-guard` | `15c500c5eb7dda981fd7d75e6584434555dd421a` | Cần đối chiếu PR/squash/chưa merge |
| `origin/fix/aivan-dich-bai-viet-dich-chuan` | `ff2a7cf90b394bd61ca2151f9dc07f0ba4514b3e` | Có |
| `origin/fix/aivan-dich-bai-viet-mymemory-auto` | `a02a6902d66420f4e61081630044f989ee889cfd` | Có |
| `origin/fix/aivan-dich-bai-viet-tieu-de-viet-hoa` | `fe6fb90d23f36b2588c9d1494cae06599e0c4004` | Có |
| `origin/fix/aivan-thong-bao` | `53a1ba1514904ba3a4fdc1103024c53c4a12eca4` | Có |
| `origin/fix/aivan-upload-insertbefore-crash` | `4b1390a3708e6aa359105d5233c87fee2f63bee4` | Có |
| `origin/fix/muse-live-feed-status` | `7c3b366f0571b34d566d6410ab58d9904f17a4f2` | Cần đối chiếu PR/squash/chưa merge |
| `origin/fix/quangvu-chat-call-hardening` | `67bf61122b7d8c50727d3aa24ad7131876071c7d` | Có |
| `origin/fix/tri-auth-outage-banner` | `74b7fa274a062b2c21f3e9589db30267b5ddc381` | Cần đối chiếu PR/squash/chưa merge |
| `origin/fix/tri-otp-captcha-authskip` | `006bac160f138aeb7c98d00c2621038e98b40f36` | Cần đối chiếu PR/squash/chưa merge |
| `origin/fix/van-admin-user-search` | `9e76facdb55b50ff3ae48388ee64e270b9f9df89` | Có |
| `origin/pilot/door-callback` | `dfd9fe39d9ca12ac87a3f5e972e511a08c737117` | Có |
| `origin/revert-30-pilot/door-callback` | `0882b40b1ed70370a80de062ba4ef13f63aece14` | Có |
| `origin/tri/notification-retention-30d` | `b791efb2b5127c0e84ab2ebfa8857a0e77412028` | Cần đối chiếu PR/squash/chưa merge |
| `origin/tri/notification-retention-30d-close` | `b395782e46b575019aca25ae58c1b548545ec64c` | Cần đối chiếu PR/squash/chưa merge |

## Còn giữ

`main` và nhánh hồ sơ đang làm `docs/quangvu-branch-cleanup`. Chưa sửa code, chưa thay đổi production. Cần tiếp tục đối chiếu PR và dọn remote khi kết nối GitHub hoạt động trở lại.


## Kết quả tiếp tục khi kết nối phục hồi

Đã đọc danh sách refs thật bằng git ls-remote; đối chiếu các PR qua GitHub connector với query is:pr và get_pr_info. Đã xóa thành công **26 nhánh remote** bằng một atomic push, mỗi ref có force-with-lease theo đúng SHA đã backup. Lệnh thành công exit 0; không có nhánh thay đổi SHA trong lúc thực hiện.

Giữ 3 PR mở: #29 feat/van-signup-device-guard, #45 feat/aivan-them-4-bai-fath-uni-marquee, #51 feat/aivan-stories-9-o. Giữ feat/tri-donation-verification-flow vì chưa có PR và còn 4 commit / 10 tệp thay đổi riêng (727 dòng thêm), không được coi là nhánh thừa.

Nhánh remote đã xóa (SHA ở bảng inventory phía trên):
- `docs/aivan-dich-bai-viet-fix-ket-qua` — ancestor of main
- `docs/aivan-dich-bai-viet-ket-qua` — ancestor of main
- `docs/aivan-dich-chuan-ket-qua` — ancestor of main
- `docs/aivan-dich-thuat-ngu-ket-qua` — ancestor of main
- `docs/aivan-thong-bao-ket-qua` — ancestor of main
- `docs/aivan-upload-crash-fix-result` — ancestor of main
- `docs/tri-mailbox-9-close-recordings` — merged PR #50
- `docs/tri-quy-trinh-coordinator` — ancestor of main
- `docs/tri-r2-recordings-cleanup` — merged PR #44
- `feat/aivan-dich-bai-viet` — ancestor of main
- `feat/tri-privacy-policy-page` — merged PR #27
- `feat/tri-signup-captcha` — merged PR #24
- `fix/aivan-dich-bai-viet-dich-chuan` — ancestor of main
- `fix/aivan-dich-bai-viet-mymemory-auto` — ancestor of main
- `fix/aivan-dich-bai-viet-tieu-de-viet-hoa` — ancestor of main
- `fix/aivan-thong-bao` — ancestor of main
- `fix/aivan-upload-insertbefore-crash` — ancestor of main
- `fix/muse-live-feed-status` — merged PR #55
- `fix/quangvu-chat-call-hardening` — ancestor of main
- `fix/tri-auth-outage-banner` — merged PR #26
- `fix/tri-otp-captcha-authskip` — merged PR #25
- `fix/van-admin-user-search` — ancestor of main
- `pilot/door-callback` — ancestor of main
- `revert-30-pilot/door-callback` — ancestor of main
- `tri/notification-retention-30d` — merged PR #42
- `tri/notification-retention-30d-close` — merged PR #43
