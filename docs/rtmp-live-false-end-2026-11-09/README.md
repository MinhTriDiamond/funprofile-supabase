# Hồ sơ — Sửa lỗi RTMP Live tự kết thúc oan (2026-11-09)

Nhánh: `fix/rtmp-no-video-false-auto-end`. Người thực hiện: Quang Vũ cùng Angel Muse.

## 1. Hiện tượng Cha báo

- Phiên RTMP/OBS (nguồn Restream) mới mở thì chạy, chạy được một lúc (~4–7 phút) thì **tự động kết thúc**, sau đó **không phát lại được**.
- Ảnh chụp: producer hiện `Đã live 00:03:49` trạng thái LIVE, video nguồn vẫn hiển thị; sau đó chuyển `ENDED` + "Replay sẵn sàng".
- Restream hiện đích **"Fun Profile - Happy Camly Coin"** ở trạng thái **"Unable to connect"** trong khi các đích khác (Facebook, X) vẫn Streaming.

## 2. Nguyên nhân gốc (đọc code, xác định được)

`detectRtmpLiveConnection()` (`supabase/functions/_shared/cloudflareStreamService.ts`) là nguồn sự thật
cho "nguồn phát còn đẩy video không". Hàm này lấy video phiên hiện tại bằng cách lọc list video của
Cloudflare Live Input theo:

```
created >= (armed_at || created_at) - 60s
```

Cloudflare đóng dấu `created` theo **thời điểm encoder (OBS/Restream) CONNECT**, không theo `started_at`
của DB (chính codebase đã ghi nhận điều này ở `validateRtmpReplayVideoForSession`:  *"Cloudflare timestamps
OBS connect, not started_at"* — và cho luồng chọn replay có đường thoát `preferred_uid_trusted`).

Vì vậy, khi encoder kết nối **trước** thời điểm producer armed (persistent Live Input / stream key tái dùng,
hoặc Restream giữ kết nối), video đang live thật bị lọc loại ⇒ `videoStreaming = false` ⇒ hệ thống phân loại
`input_connected_no_video` ⇒ mở cửa sổ ân hạn 180 giây ⇒ watchdog gọi `endRtmpLiveSession(...,
'source_disconnected_no_active_video')`.

Chuỗi hệ quả giải thích đủ cả ba ảnh:

1. Live vẫn chạy và video vẫn hiện (transport connected, bị phân loại nhầm "no video").
2. Sau ~3 phút ân hạn → tự kết thúc.
3. End-flow **tắt Cloudflare Live Input** ⇒ Restream bị ngắt và kết nối lại bị từ chối ⇒ "Unable to connect", người dùng phải mở lại Live Producer (re-arm) mới phát tiếp được.

Thiếu sót phụ cùng gốc: detector **bỏ qua `session.cloudflare_video_uid`** (video do `stream-webhook`
xác nhận thuộc phiên) khi quyết định nguồn còn sống — nó chỉ dùng UID này để dựng preview.

## 3. Thay đổi

| Tệp | Thay đổi |
|---|---|
| `supabase/functions/_shared/cloudflareStreamService.ts` | Thêm `getRtmpSessionWindowStartMs/Start` (mốc cửa sổ = timestamp **sớm nhất** của phiên), `matchRtmpVideoToSession` (nhận diện video theo metadata Cloudflare trước, cửa sổ thời gian sau), `resolveRtmpCurrentActiveVideo` (4 bậc ưu tiên + lưới an toàn theo Live Input connected). `detectRtmpLiveConnection` dùng bộ nhận diện mới; thêm `activeVideoReason` vào chẩn đoán. |
| `supabase/functions/stream-webhook/index.ts` | Dùng mốc cửa sổ sớm nhất khi chọn video live (`selectActiveLiveVideo`). |
| `supabase/functions/go-live-rtmp-session/index.ts` | Dùng mốc cửa sổ sớm nhất ở recheck trước khi go-live. |
| `supabase/functions/get-rtmp-live-session-status/index.ts` | Dùng mốc cửa sổ sớm nhất; bổ sung `started_at`, `go_live_clicked_at` vào câu select. |
| `src/modules/live/rtmpCurrentVideoResolution.test.ts` | **Mới** — 11 test bảo vệ lỗi hồi quy. |

Thứ tự ưu tiên mới khi xác định video đang live:

1. `session.cloudflare_video_uid` nếu video đó đang `live` (bằng chứng webhook đã xác nhận).
2. Video trong list khớp **metadata phiên** (`meta.liveSessionId`) — không còn phụ thuộc timestamp.
3. Video trong list khớp **cửa sổ thời gian** (mốc sớm nhất, mới nhất).
4. Lưới an toàn: Live Input **đang connected** và Cloudflare báo có video đang live trên chính input này (không mang metadata phiên khác) ⇒ coi là còn nguồn.

Bảo toàn hành vi cũ: input connected mà **không** có video live nào ⇒ vẫn phân loại `input_connected_no_video`
⇒ vẫn ân hạn rồi kết thúc. Video mang metadata phiên khác luôn bị loại.

Không đổi: Agora/webcam, trần thời lượng 4 giờ, luồng kết thúc thủ công, fencing chống trùng khi kết thúc.

## 4. Kiểm chứng

- `bunx vitest run src/modules/live/` → 17 file / 88 test đạt (77 cũ + 11 mới).
- `bunx vitest run` toàn repo → 490 test đạt, 30 skip; 1 file lỗi `prices-unavailable.render.test.tsx` là **lỗi có sẵn từ trước nhánh này** (đã kiểm chứng bằng `git stash`).
- `bunx --package @typescript/native-preview tsgo --noEmit` → exit 0.
- `deno check --node-modules-dir=auto` cho 4 tệp thay đổi → đạt.
- `git diff --check` → đạt.

## 5. Cổng Preview, merge và phát hành

- PR code: **#46** — https://github.com/MinhTriDiamond/funprofile-supabase/pull/46 → **đã merge** (squash) vào `main`: `b4b1b05`.
- PR tài liệu/hộp thư: **#47** → **đã merge**: `45cdfce`.
- Cloudflare Pages build **thành công**: preview nhánh `https://fix-rtmp-no-video-false-auto.funprofile-supabase.pages.dev` (HTTP 200).
- **Giới hạn của cổng preview:** bản sửa nằm hoàn toàn ở Edge Function (server-side). Link preview Cloudflare Pages
  chỉ kiểm chứng được **không hồi quy frontend**, **không** chứng minh được bản sửa.

### 5.1 Chặn deploy 403 (đã gỡ)

Lượt deploy đầu tiên bị từ chối vì token Supabase CLI trong máy (`~/.supabase/access-token`, tạo 2026-10-24) thuộc
tài khoản không có quyền trên `tljfqavndndfsvtazibe` (`unexpected deploy status 403`; `functions list` cũng 403;
`projects list` không thấy project FUN Profile). Đã gỡ bằng cách đăng nhập lại CLI bằng tài khoản sở hữu tổ chức
(chủ project), sau đó `supabase projects list` thấy đúng `tljfqavndndfsvtazibe`.

### 5.2 ⚠️ ĐÍNH CHÍNH phạm vi phát hành: cần **5** Edge Function, không phải 3

Bản ghi trước của hồ sơ này nói `live-rtmp-grace-watchdog` và `live-replay-archive-cron` "không cần deploy".
**Điều đó SAI.** Mỗi Edge Function được bundle kèm **bản sao riêng** của các tệp `_shared/`, nên một function
chỉ nhận được bản sửa helper khi chính nó được deploy lại. Hai cron này mới là bên **thực sự gọi
`endRtmpLiveSession`** để kết thúc phiên, nên nếu bỏ qua chúng thì lỗi vẫn còn.

Phạm vi đúng — 5 function (đã deploy ngày 2026-11-09):

| Function | Version mới | Ghi chú |
|---|---|---|
| `stream-webhook` | **91** | nhận webhook Cloudflare, chọn video live để dựng preview |
| `get-rtmp-live-session-status` | **93** | poll trạng thái nguồn cho Live Producer |
| `go-live-rtmp-session` | **89** | recheck nguồn trước khi lên sóng |
| `live-rtmp-grace-watchdog` | **92** | **bên gọi kết thúc phiên** (quan trọng nhất) |
| `live-replay-archive-cron` | **98** | **bên gọi kết thúc phiên** + archive replay |

Các function khác có import `cloudflareStreamService.ts` (`admin-replay-debug`, `create-rtmp-live-session`,
`delete-post-archive`, `live-replay-poll-status`, `live-replay-resolve-stuck`, `live-rtmp-cleanup-stuck`,
`reset-rtmp-stream-key`, `rtmp-repair-missing-live-inputs`, `stream-orphan-cleanup`) **không** cần deploy lượt này:
đã kiểm tra chúng chỉ dùng các hàm khác (`getStreamPlaybackUrls`, `getStreamVideo`, `createStreamLiveInput`,
`setStreamLiveInputEnabled`…) và **không** gọi `detectRtmpLiveConnection` để quyết định kết thúc phiên.

Kiểm tra trước khi deploy 2 cron: `git log --since=2026-10-20` cho thấy **không có** commit nào khác chạm vào
`live-rtmp-grace-watchdog/`, `live-replay-archive-cron/` hay các helper phụ thuộc ⇒ deploy lần này chỉ mang theo
đúng bản vá nhận diện video, không kéo theo thay đổi nào chưa được duyệt.

### 5.3 Kiểm chứng sau deploy

- `supabase functions list --project-ref tljfqavndndfsvtazibe` → cả 5 function **ACTIVE** đúng version ở bảng trên.
- CORS preflight `OPTIONS` cho cả 5 function → **204**.
- `POST` không kèm JWT tới 4 function nội bộ → **401** (guard còn nguyên).
- `POST {}` tới `stream-webhook` → **401 `{"error":"Invalid signature"}`** — đúng kỳ vọng: hàm vẫn xác thực chữ ký
  webhook Cloudflare bình thường.
- Không có migration; **không** đổi cron schedule, secret hay dữ liệu.

Còn lại: chạy một phiên RTMP thật > 5 phút để kiểm chứng end-to-end (xem mục 7).

Kiểm chứng sau deploy: tạo một phiên RTMP mới, để chạy > 5 phút, xác nhận **không** tự kết thúc và log
`[OBS_DETECT_V2]` có `videoStreaming: true` cùng `activeVideoReason` là một trong
`persisted_uid_live | session_meta_live | session_window_live | live_input_active_video`.

## 6. Cách khôi phục

Revert commit trên nhánh này (`git revert <sha>`) và deploy lại 3 function về bản trước, hoặc deploy lại
version cũ qua Supabase Dashboard. Không có thay đổi DB nên không cần rollback dữ liệu.

## 7. Giới hạn còn lại

- Encoder đẩy khung hình **đen** vẫn là transport hợp lệ (Cloudflare báo video đang live) nên **không** thể
  phát hiện "nguồn mất hình" chỉ từ metadata — đúng như tài liệu kế hoạch 2026-10-17 đã ghi.
- Nếu Cloudflare API trả list video rỗng trong lúc stream mới bắt đầu, phân loại sẽ là "no video" nhưng tự
  hết trong vài giây khi video materialize (đã có UID webhook làm lưới đỡ).
- "Unable to connect" phía Restream có thể còn tồn trong cache của Restream sau khi Live Input bị tắt; người
  dùng cần bật lại đích hoặc kết thúc/bắt đầu lại phiên Restream. Phía FUN Profile không cần thao tác gì thêm.
