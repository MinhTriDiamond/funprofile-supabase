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

- PR: **#46** — https://github.com/MinhTriDiamond/funprofile-supabase/pull/46 (nhánh `fix/rtmp-no-video-false-auto-end`).
- **Đã merge** (squash) vào `main` ngày 2026-11-09: commit `b4b1b05`.
- Cloudflare Pages build **thành công**:
  - Preview nhánh: `https://fix-rtmp-no-video-false-auto.funprofile-supabase.pages.dev` (HTTP 200)
- **Giới hạn của cổng preview:** bản sửa nằm hoàn toàn ở Edge Function (server-side). Link preview Cloudflare Pages
  chỉ kiểm chứng được **không hồi quy frontend**, **không** chứng minh được bản sửa. Muốn kiểm chứng thật phải
  deploy 3 function dưới đây rồi chạy một phiên RTMP thật > 5 phút.
- **⚠️ Deploy đang bị chặn 403.** Ngày 2026-11-09 đã chạy Supabase CLI và nhận:
  `unexpected deploy status 403: Your account does not have the necessary privileges to access this endpoint`.
  `supabase functions list --project-ref tljfqavndndfsvtazibe` **cũng 403**. `supabase projects list` chỉ thấy
  `richard-book`, `richardbook`, `lovehub.fun`, `docs.fun.rich` — không thấy project FUN Profile. Nguyên nhân:
  token CLI trong máy (`~/.supabase/access-token`, tạo 2026-10-24) thuộc tài khoản không có quyền trên project
  `tljfqavndndfsvtazibe`. **Cần một trong hai:** (a) người sở hữu tổ chức chạy `supabase login` trên máy này
  rồi deploy lại, hoặc (b) giao Lovable deploy Edge Function.
  Lệnh deploy sẵn sàng: `supabase functions deploy stream-webhook get-rtmp-live-session-status go-live-rtmp-session --project-ref tljfqavndndfsvtazibe`.

Không có migration. Cần deploy **3 Edge Function** lên project `tljfqavndndfsvtazibe`:

1. `stream-webhook`
2. `get-rtmp-live-session-status`
3. `go-live-rtmp-session`

(`_shared/cloudflareStreamService.ts` là helper dùng chung, không deploy độc lập — nội dung của nó đi kèm 3
function trên.)

`live-rtmp-grace-watchdog` và `live-replay-archive-cron` **không cần deploy** (chúng gọi helper chung nên
hưởng lợi ngay ở lần deploy kế tiếp; nếu muốn áp cùng lúc thì deploy luôn cũng an toàn). Không đổi cron,
không đổi secret, không đổi dữ liệu.

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
