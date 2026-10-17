# Hộp thư của Quang Vũ — Livestream / Agora

> Việc mới nhất nằm ở trên cùng. Vũ phản hồi trạng thái ngay dưới mỗi mục nhé.

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
