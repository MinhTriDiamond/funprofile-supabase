# Background Video Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream xử lý video bài viết tạm thời, chuyển MP4 tối ưu về R2 để phát/tải lâu dài, rồi xóa VOD tạm sau khi bản R2 và publish được xác minh.

**Architecture:** Job bền vững trong Postgres, enqueue nguyên tử theo attachment. Edge Function/cron xử lý mỗi lượt một phase hoặc một part; Stream làm encoder. Tái sử dụng low-level R2 multipart/Stream helpers, không dùng bảng hay state machine live_replays cho bài viết thường.

**Tech Stack:** React18/TypeScript5/Vite5, Supabase Postgres/Edge Functions, Cloudflare Stream/R2; bun, Vitest, tsgo. Không thêm framework.

**Spec:** `docs/superpowers/specs/2026-11-24-background-video-processing-design.md` (bản đã cập nhật Stream tạm → R2 lâu dài).

## Global Constraints

- Upload ứng dụng tối đa10GiB, thời lượng4giờ; bản MP4 tối ưu R2 không TTL. Không tự xóa tệp gốc R2.
- V1 canary/bài public; non-public được bỏ qua, không tạo output public mới. Thay privacy/source trong lúc xử lý phải chặn publish.
- Một part16MiB/lượt; bộ nhớ không theo kích thước cả tệp. Không chờ encoding trong một request dài.
- Không đụng file Supabase client/types tự sinh, .env VITE_SUPABASE, project-level config. Block function config riêng được phép.
- Schema mới có GRANT + RLS + policy; RPC quản trị chỉ service_role. Không chạy DDL bằng admin-sql hoặc đổi schema auth/storage/realtime/vault.
- Chỉ dùng credential/account hiện có; không mua thêm gói, không đăng ký đè webhook, không quét/xóa video cũ.
- Feature flag mặc định off; canary riêng trước bật rộng. Không dùng anon key làm quyền gọi cron.
- Mọi bước production có backup/source manifest, cách khôi phục, ghi hộp thư, PR và Preview đúng commit.

## Review Focus

1. Callback cũ sau khi nguồn/privacy/bài viết thay đổi không được publish hoặc hồi sinh post: Task2/4; output đã publish rồi đổi private phải được bảo vệ: Task5.
2. UID live hoặc VOD không thuộc job không bao giờ bị cleanup của feature này xóa: Task1/7.
3. Origin trả200 toàn file, Content-Range sai hoặc MP4 export chưa ready không được đọc toàn bộ vào RAM hay coi là thành công: Task3/4.
4. Crash sau complete/publish/delete phải resume idempotent bằng lease fencing, không nhân đôi VOD hoặc feed: Task2/4.
5. Tệp đã nén sẵn không được thay bằng bản lớn hơn; xóa Stream không được làm mất đường phát lâu dài: Task1/4/8.

---

## File map

- New shared: `_shared/postVideoPolicy.ts` (pure decisions/types), `postVideoStream.ts` (Stream API/cap/quota/export), `postVideoTransfer.ts` (bounded MP4→R2), `postVideoProcessor.ts` (orchestration/lease), `postVideoReferences.ts` (cleanup allowlist).
- New functions: `post-video-process/index.ts` (cron/admin actions), `post-video-status/index.ts` (owner retry/status nếu cần ngoài post metadata).
- Migration mới: `supabase/migrations/<timestamp>_post_video_processing.sql` (jobs/control/outbox, enqueue/claim/publish RPC).
- Modify: `stream-webhook/index.ts` (route job VOD), `stream-orphan-cleanup/index.ts`, `cleanup-orphan-videos/index.ts`, R2 cleanup callsites có thể tác động key video (chỉ khi khảo sát xác nhận), `supabase/config.toml` function blocks.
- New private delivery: `workers/post-video-media/src/index.ts`, `workers/post-video-media/wrangler.jsonc`, `supabase/functions/post-video-read/index.ts`, `_shared/postVideoReadPolicy.ts`, `src/hooks/usePostVideoPlayback.ts`. Worker tên `funprofile-post-video-media`, route đề xuất `fun.rich/media-optimized/*`, binding bucket private `POST_VIDEO_OUTPUT_BUCKET`; không service-role key trong Worker.
- Frontend: `src/components/feed/PostMedia.tsx`, `src/components/feed/MediaGrid.tsx`, type/helper cục bộ và UI xử lý; i18n vi/en tương ứng. Không đổi route.
- Tests: `src/__tests__/post-video-read.test.ts`, Worker range/auth fixtures và player renewal tests; `src/__tests__/post-video-{policy,repository,stream,transfer,processor,references}.test.ts`, `src/components/feed/__tests__/PostVideoProcessing.test.tsx`; integration SQL fixture chạy DB test riêng.

### Task 1: Chốt policy thuần và tiêu chí dọn

**Interfaces:** `PostVideoFacts` gồm sourceOwned/postExists/sourceUnchanged/isPublic/exportReady/r2Verified/outputSmaller/outputPublished/streamIsLive/streamOwned/streamStillReferenced/sourceVerified (boolean). `PostVideoAction.type` gồm wait/import/poll_encoding/request_export/copy_part/verify_r2/publish_r2/delete_stream/complete/needs_review. `PostVideoPhase`, `PostVideoJob`, `PostVideoFacts`, `PostVideoAction`; `decidePostVideoAction(job: PostVideoJob, facts: PostVideoFacts): PostVideoAction`; `computePostVideoBudget(input: {limitMinutes:number; usedMinutes:number; reservedMinutes:number; liveReserveMinutes:number}): number`. Types trong postVideoPolicy.ts, không import Deno/Supabase.

- [ ] Viết RED: `neverDeletesBeforeR2Published`, `neverDeletesLiveOrForeignUid`, `noSwapWhenExportNotSmaller`, `noCleanupOriginal`, `budgetFailsClosedOnUnknown`, `privateAndChangedSourceCannotPublish`. Assert không có action xóa khi thiếu bất kỳ verified/published/ownership flag; reserve mặc định240phút, ceil phần job trong đơn vị giây để tránh cấp thiếu do làm tròn.
- [ ] Run `bunx vitest run src/__tests__/post-video-policy.test.ts` → FAIL đúng hàm/behavior còn thiếu.
- [ ] Implement policy với phase theo spec; not_beneficial giữ nguyên source và chỉ cho dọn VOD sau source verification. Không suy duration client là trusted.
- [ ] Run test → PASS; kiểm tra size biên10GiB và duration4giờ vẫn theo config hiện tại.
- [ ] Commit `feat(video): add safe post video processing policy`.

### Task 2: Job bền vững, enqueue, lease và publish nguyên tử

**Interfaces:** SQL RPC `claim_post_video_job(p_job_id uuid,p_lease_token uuid,p_lease_seconds int)`, `advance_post_video_job(p_job_id uuid,p_lease_token uuid,p_expected_phase text,p_patch jsonb)`, `publish_post_video_output(p_job_id uuid,p_lease_token uuid)`; client chỉ đọc trạng thái owner, không gọi RPC service. `postVideoProcessor.ts` repository adapter gọi các RPC này với input đã validate.

- [ ] Viết RED SQL/integration fixtures: insert attachment hợp lệ enqueue đúng 1 job trong cùng transaction; bỏdraft/non-video/non-public; nguồn không có completed upload session của owner bị từ chối; hai claim chỉ1thắng; token lease cũ không advance; thay nguồn/đổi privacy/xóa post chặn publish; retrypublish không nhân đôi media.
- [ ] Tạo harness `scripts/test-post-video-db.ts` và fixture `scripts/tests/post-video-processing.sql`; chạy `bun scripts/test-post-video-db.ts` → FAIL. Harness chỉ nhận POST_VIDEO_TEST_DATABASE_URL với host loopback và test database riêng, từ chối project production; không chạy test phá dữ liệu trên production. Nếu chưa có DB test, dựng test local hoặc môi trường test được phép trước khi tuyên bố migration đã kiểm chứng.
- [ ] Tạo migration: bảng jobs, bảng control/account reservations; đủ GRANT/RLS/policy, index unique attachment+source version, trigger enqueue, RPC fenced. Dùng trigger cho rule phụ thuộc thời gian. Publish lock job/post/attachment, thay đúng URL cũ trong mọi trường tương thích, giữ thứ tự/metadata/media khác, lưu snapshot rollback và provenance.
- [ ] Run fixtures → PASS; role authenticated không tự sửa UID/phase/URL output; service_role đúng scope. Typecheck bằng kiểu cục bộ, không sửa types tự sinh.
- [ ] Commit `feat(video): persist and fence post video jobs`.

### Task 3: Stream API và transfer có bộ nhớ giới hạn

**Interfaces:** `readPostVideoStorageUsage(): Promise<{usedMinutes:number;limitMinutes:number}>`; `startPostVideoImport(job): Promise<{uid:string;mode:'copy'|'tus'}>`; `readPostVideoExport(uid): Promise<{ready:boolean;url:string|null;size:number|null}>`; `transferPostVideoPart(job): Promise<{partNumber:number;etag:string;size:number}>`; helpers đọc UID/account từ jobserver, không nhận URL client tùy ý.

- [ ] Viết RED: export status=inprogress/percentnull khôngready; usage missing/invalid hoãn; hardcap import không được suy từ field response; Range200/lengthsai/redirectsanghostlạ bị từchối; request đúngpart16MiB và cancellation; không arrayBuffer toàn tệp.
- [ ] Run `bunx vitest run src/__tests__/post-video-stream.test.ts src/__tests__/post-video-transfer.test.ts` → FAIL.
- [ ] Implement adapter mới dùng credential getter hiện có; bounded allowlist URL Cloudflare/R2, explicit fetch timeout, validate redirects, range start/end/total/body limit. Tái sử dụng createMultipartUpload/uploadPart/complete/abort nhưng không sửa behavior RTMP dùng chung. Persist part ETag/offset sau mỗi part và phục hồi complete bằng HEAD exact size.
- [ ] Kiểm chứng copy server-side duration hardcap bằng API docs + canary. Nếu không chứng minh được, implement TUS maxDurationSeconds14400, reservation240phút/job, server transfer từng part nguồn R2 với offset bềnvững. Không mở copy unbounded đại trà. Không dùng headContentLength/fetchRangeFromUrl cũ nếu fallback có thể đọc toàn body200.
- [ ] Run tests → PASS, commit `feat(video): add bounded Stream import and R2 export adapters`.

### Task 4: Điều phối, webhook và cron độc lập tab

**Interfaces:** `processPostVideoJob(admin,jobId:string): Promise<{phase:PostVideoPhase;retryAt?:string}>`; `handlePostVideoWebhook(admin,video,event): Promise<boolean>` trả true chỉ khi xửlý UID job; function POST với action `tick|retry|dry-run` qua cron secret/adminJWT thật, OPTIONS CORS trước handler.

- [ ] Viết RED: browser đóng vẫnadvance; duplicate webhook khôngdoubleimport; staleleasekhôngpublish; timeoutcopy→needs_review không copy lại mù; Streamready nhưngexportchưa ready khôngtransfer; R2verifythấtbại khôngpublish/delete; publishedR2 + delete500 giữstream_delete_pending; DELETE404 hoàn tất idempotent.
- [ ] Run `bunx vitest run src/__tests__/post-video-processor.test.ts` → FAIL.
- [ ] Implement mỗi tick mộtphase/mộtpart, lease180giây, timeouttừngI/O tốiđa45giây, backoff30/60/120/240/480giây, tốiđa5lần lỗi liên tiếp cho cùngoperation trước needs_review. Waitingencoding không tínhlỗi. Feature control tách import/publish/delete, off vẫn cho đọc trạng thái. Kiểm tra export nhẹhơnnguồn; not_beneficial giữ nguồn, ghi outcome riêng.
- [ ] Phân tuyến trong webhook hiện có sau HMAC; không tạosubscriptionmới hoặc re-register. Giữ luồng RTMP khi UIDkhôngkhớp. Xác minh source HEAD/range và output R2 HEAD exactsize/206/MP4metadata trước fencedpublish. XóaStream chỉsaupublish, đúng job/account/type và khôngcònthamchiếu; không xóa originalR2.
- [ ] Run processor + existing RTMP/archive regression tests → PASS; commit `feat(video): process and archive post videos in background`.

### Task 5: R2 private và quyền phát/tải có thể thu hồi

**Interfaces:** `authorizePostVideoRead(input:{attachmentId:string;viewerId:string|null;sourceGeneration:string}): Promise<{allowed:boolean;key?:string;size?:number;mime?:string}>`; Edge action mint/authorize trong `post-video-read`. `usePostVideoPlayback(attachmentId)` trả URL gateway đã cấp token5phút và callback renew giữ currentTime. Token gắn viewer/post/attachment/generation, không chứa secret và không lưuDB metadata.

- [ ] Viết RED `publicToPrivateRevokesGuestOnNextRange`, `friendRemovedCannotContinueNewRequests`, `privateNonOwnerDenied`, `ownerCanReadAfterPrivacyChange`, `deletedPostAndStaleGenerationDenied`, `expiredTokenRefreshKeepsPosition`, `rangeHeadersAndDownloadBodyComplete`. Test HEAD/GET/206/416, bytes không bị truncate, mọi request đều qua authorize.
- [ ] Run `bunx vitest run src/__tests__/post-video-read.test.ts` và Worker test harness local → FAIL. Harness Worker phải mock R2/Edge auth; không dùng production bucket.
- [ ] Implement Worker binding bucket private duy nhất và authorization callback Edge; Edge kiểm tokenMAC/timestamp/viewer rồi kiểm quyền post hiện tại theo quy tắc feed (privacy/friends/block). Worker không giữ Supabase service_role. Dùng secret MAC chuyên dụng, provision qua dashboard/secret manager ở bước phát hành; không in ra chat/log/repo. R2 range đọc streaming, Content-Range/Length/Type đúng, full download hoàn chỉnh; lỗi auth/API thì fail closed. Không cache response chứa token hoặc bỏ qua auth do cache public.
- [ ] Output transfer Task3 ghi bucket private; metadata publish Task2 giữ locator gateway ổn định và attachmentId, không URL R2 public hay token viewer. Validate preview/local credentials trước bật; không fallback public khi private reader lỗi. R2 original giữ hiện trạng cũ; không hứa thu hồi những byte/URL cũ đã được công khai.
- [ ] Run tests + actual local browser range/download/renewal → PASS; commit `feat(video): protect optimized R2 media with authorized delivery`.

### Task 6: Hiển thị xử lý và phát MP4 R2

**Interfaces:** post metadata `video_processing_by_attachment` chỉ chứa phase/progress/safeError/outcome, không token/export URL; `getPostVideoPresentation(metadata,attachmentId)` trả label và safe retry capability. Media cuối là locator gateway ổn định cùng storage_key/size_bytes R2 output. UI dùng Task5 để lấy URL đọc theo viewer; không lưu token vào post.

- [ ] Viết RED render tests: queued/importing/encoding/copying khônglàmẩn bài; ready đổinguồnR2; failedgiữnguồn/thử lạichỉ owner; not_beneficialkhôngbáonénthànhcông; nhiềuattachmentkhôngđổinhầmvideo; image-onlykhôngthêmquery; non-publickhôngbáođãtốiưu.
- [ ] Run `bunx vitest run src/components/feed/__tests__/PostVideoProcessing.test.tsx` → FAIL.
- [ ] Implement thông báo xử lý bằng semantic tokens, mobile-first. Dùng realtime/cache invalidation đúng post; không poll mọi bài mỗi vài giây. Khi snapshotpost/attachmentcũ mới khác nhau tạm thời không giấu video. Download cuối là MP4 R2 qua gateway có quyền, không Stream HLS; URL token được gia hạn khi cần. Không quảng cáo autoquality cho MP4mộtmức.
- [ ] Run new UI + full feed regression + tsgo → PASS; commit `feat(feed): show background video optimization status`.

### Task 7: Tích hợp bảo vệ cleanup và vòng đời post

**Interfaces:** `collectPostVideoReferences(admin): Promise<{protectedStreamUids:Set<string>;protectedR2Keys:Set<string>}>`; đọc lỗi phải throw để cleanup dừng, không trả setrỗng. `canDeletePostVideoStream(job,references)` dùng policyTask1.

- [ ] Viết RED: cảhaiStreamcleaner giữjobimport/export/copy; giữoutputR2lâudài; queryjobs/attachmentserrorphảidừngxóa; UIDRTMPkhôngbịxóa; xóa posttronglúccopykhôngpublishlại; userđãđổisourcekhôngbịjobcũghiđè.
- [ ] Run `bunx vitest run src/__tests__/post-video-references.test.ts` → FAIL.
- [ ] Modify Stream orphan cleaners theo helper mới. Khảo sát mọi đường dọn R2 trước chạmcode: chỉnối bảo vệ nếu chúng thực sự xửlý R2keyvideo; khôngthêm truy vấn job vào cleanup SupabaseStorage không liên quan. Trigger post/attachment deletion đánhdấucancel/tombstone; worker dọnVOD đúng job và multipartdởdang, khôngbatchdeletevideocũ.
- [ ] Run reference/processor + existing cleanup regression tests → PASS; commit `fix(video): protect post processing assets from orphan cleanup`.

### Task 8: Triển khai có kiểm chứng, canary và hồ sơ kết quả

**Files:** function config riêng, Worker private-bucket binding/route và secret-manager setup được review; migration cron/control bổ sung nếu cần; `docs/background-video-processing-2026-11-24/README.md`, mailbox kếtquả. Không sửa credentials trong repo.

- [ ] Run bộtest mới + feed/RTMP regression và `bunx --package @typescript/native-preview tsgo --noEmit`; build; reviewer độc lập trên toàn nhánh. Kiểm tra5ReviewFocus có ca test thực sự.
- [ ] Snapshot source/config production và metadata mục tiêu. Provision bucket private/gateway route và MAC secret là bước hạ tầng cụ thể cần kiểm quyền/quy trình phê duyệt; không tự mở rộng credential hoặc public exposure. Migration theo quy trình duyệt dự án, function/deploy cron được review trước apply; không dùng raw SQL admin-sql choDDL. Cron dùng secret đã có, không phơi secret trong câu SQL/log/report. Xác minh exact deployedsource/version và flags, không báo done nếu chỉ có codeoff.
- [ ] Push PR → lấy linkCloudflarePreview đúnghead → test upload mẫu public, đóngtab, job vẫn hoàn tất; R2MP4 phát desktop/mobile, size/duration/audio đạt, feed và download dùngR2. Thử đổi bài public→private sau publish: guest đọc lại/Range bị chặn, owner/friend còn quyền vẫn đọc đúng; download và gia hạn token không làm rơi vị trí phát. Thử rollback metadata/source, retry sau crash và quotaAPIerror. Tệp MP4nhỏ hơn nguồn là kếtquả đo được, khôngtựđặtmục tiêu phầntrăm.
- [ ] Trước canary 3,40 GB hiện có, chuẩn bị rõpost/attachment/nguồn và xin xác nhận chuyển đúngtệp sangStream nếu chưa được phéptrongphiên. Canary cleanup dọnVOD mới thuộcjob sau R2verified/published; kiểmtra Stream404/R2HEAD200/range206 và usagegiảm. Tệp gốcR2giữ lại. Không xóa nguồn hay VOD ngoàijob.
- [ ] Merge sauPreview; rolloutpublic mới cóquota/hardcapđãkiểm chứng. Nativecode↔source production và cron tick xác minh; mailbox kếtquả/phục hồi + tin Telegram. Xóa nhánh đãmerge. Nếucanary không đạt thìgiữflagoff vàbáo cụthể phần còn thiếu, không coi là tính năng đã hoàn thành.

## Self-review / handoff

Coverage: mỗi mục spec có task tương ứng (policy1, durability2, providers3, state/webhook4, private delivery5, UI6, cleanup7, production8). Tạo job tối ưu cho bài đã non-public từ đầu, adaptive HLS trên R2 và xóa tệp gốc nằm ngoài V1, không bị vô tình triển khai. Những con số lease/part/retry là quyết định kỹ thuật của bé, phải kiểm chứng bằng thời gian/memory canary. Chưa viết code sản phẩm. Self-review đã đối chiếu đủ10mục spec với8task, kiểm tra tên interface/types và gắn5ReviewFocus vào test của task sở hữu; không thấy yêu cầu trong V1 bị bỏ trống. Những phần cần kiểm chứng runtime được giữ thành gate canary trước rollout, không giả định đã đạt.

Đề xuất execution: **Native** — bé triển khai từng task trong phiên này, một review độc lập toàn nhánh trước merge; các phần phụ thuộc chặt vào cùngjob contract. Chờ Cha xem kế hoạch và chọn cách thực hiện theo skill writing-plans trước khi implementation.
