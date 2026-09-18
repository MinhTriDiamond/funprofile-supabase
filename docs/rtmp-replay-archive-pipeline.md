# RTMP Replay Archive Pipeline cho FUN Profile

Tài liệu này đóng gói tính năng **RTMP Replay Archive Pipeline** để gửi cho Lovable triển khai/đối chiếu. Mục tiêu là biến Cloudflare Stream thành lớp ingest/transcoding/live recording tạm thời, còn Cloudflare R2 là nơi lưu trữ và phát replay dài hạn.

## 1. Mục tiêu

RTMP live bằng OBS/vMix/Restream/OneStream cần đi theo lifecycle production-grade:

```txt
OBS / RTMP
  -> Cloudflare Stream Live Input
  -> Cloudflare xử lý live + recording
  -> Cloudflare video READY
  -> Export/download MP4
  -> Upload MP4 sang Cloudflare R2
  -> Verify R2 playable
  -> Create/update replay post
  -> Replay playback dùng R2
  -> Delete Cloudflare Stream video
```

Quy tắc quan trọng:

- Replay trên feed **không phát từ Cloudflare Stream lâu dài**.
- Replay chỉ render player khi **R2 đã sẵn sàng và playable**.
- Nếu archive chưa xong, feed hiển thị trạng thái xử lý, không render video source null để tránh loading vô hạn.
- Chỉ delete Cloudflare Stream video sau khi R2 verify OK và post đã được update.

## 2. Audit hiện tại

Các file/path liên quan:

| File | Vai trò |
| --- | --- |
| `supabase/functions/end-rtmp-live-session/index.ts` | Kết thúc RTMP live, tạo/upsert record replay, chuyển live post sang trạng thái replay processing |
| `supabase/functions/_shared/archiveReplayService.ts` | Pipeline archive: kiểm tra Cloudflare, export MP4, upload R2, update replay post, delete Stream video |
| `supabase/functions/_shared/r2StorageService.ts` | Upload/head/delete R2 object, ký URL, verify URL playable |
| `supabase/functions/_shared/replayFeedService.ts` | Update post metadata/video URL sau khi R2 archive ready |
| `supabase/functions/live-replay-archive-cron/index.ts` | Background cron/retry worker cho replay archive |
| `src/components/feed/PostMedia.tsx` | Render media/replay trên feed/profile |
| `src/hooks/live/useLiveReplayStatus.ts` | Supabase Realtime/poll hydrate replay khi archive ready |
| `supabase/migrations/20260511000100_rtmp_replay_archive_lifecycle.sql` | Chuẩn hóa trạng thái và DB fields cho replay archive lifecycle |

Nguyên nhân replay loading/spinner vô hạn:

- Feed có thể render player khi replay chưa có URL R2 hợp lệ.
- Một số metadata vẫn trỏ tới Cloudflare Stream/HLS hoặc source null sau khi live ended.
- Cloudflare Stream video có thể bị xóa hoặc chưa ready trong khi UI đã cố phát replay.
- Realtime hydrate trước đây chỉ chờ trạng thái `archived`, chưa bao gồm các bước sau archive như `replay_posted` hoặc `stream_deleted`.

Fix chính:

- `PostMedia.tsx` chỉ render ended replay video khi R2 ready.
- `useLiveReplayStatus.ts` chỉ hydrate replay khi `archive_status` nằm trong nhóm ready và có `r2_video_url`.
- Archive pipeline cập nhật lifecycle rõ ràng qua từng bước.
- Sau khi R2 verify và post update thành công mới xóa Cloudflare Stream video.

## 3. Lifecycle chuẩn

Các trạng thái chuẩn cho RTMP live/replay:

```ts
type LiveSessionStatus =
  | 'waiting_for_obs'
  | 'source_connected'
  | 'live'
  | 'ended'
  | 'processing_stream'
  | 'stream_ready'
  | 'exporting_mp4'
  | 'uploading_r2'
  | 'verifying_r2'
  | 'archived'
  | 'replay_posted'
  | 'stream_deleted'
  | 'failed'
```

Ý nghĩa:

- `ended`: live đã kết thúc, replay đang chờ xử lý.
- `processing_stream`: Cloudflare Stream recording chưa ready.
- `stream_ready`: Cloudflare video/MP4 download đã sẵn sàng.
- `exporting_mp4`: đang request/poll MP4 export.
- `uploading_r2`: đang upload MP4 sang R2.
- `verifying_r2`: đang verify R2 object/playable URL.
- `archived`: R2 archive đã OK.
- `replay_posted`: post replay đã được update để phát từ R2.
- `stream_deleted`: Cloudflare Stream video đã được xóa sau khi replay R2 OK.
- `failed`: archive lỗi, lưu `archive_error` để retry/debug.

## 4. Source code

### 4.1 Migration DB lifecycle

File: `supabase/migrations/20260511000100_rtmp_replay_archive_lifecycle.sql`

```sql
-- RTMP replay archive lifecycle normalization.
-- Cloudflare Stream is temporary ingest/transcoding storage; R2 is the durable replay source.

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check
  CHECK (
    status IN (
      'created',
      'waiting_for_obs',
      'source_connected',
      'ready_to_go_live',
      'live',
      'ended',
      'processing',
      'archiving',
      'posted',
      'processing_stream',
      'stream_ready',
      'exporting_mp4',
      'uploading_r2',
      'verifying_r2',
      'archived',
      'replay_posted',
      'stream_deleted',
      'failed'
    )
  );

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS cloudflare_input_id text,
  ADD COLUMN IF NOT EXISTS r2_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS cloudflare_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delete_stream_error text;

UPDATE public.live_sessions
SET cloudflare_input_id = COALESCE(cloudflare_input_id, cloudflare_live_input_id)
WHERE cloudflare_input_id IS NULL
  AND cloudflare_live_input_id IS NOT NULL;

UPDATE public.live_sessions
SET cloudflare_deleted_at = COALESCE(cloudflare_deleted_at, stream_deleted_at)
WHERE cloudflare_deleted_at IS NULL
  AND stream_deleted_at IS NOT NULL;

ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS cloudflare_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delete_stream_error text,
  ADD COLUMN IF NOT EXISTS r2_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_ready_at timestamptz;

UPDATE public.live_replays
SET cloudflare_deleted_at = COALESCE(cloudflare_deleted_at, stream_deleted_at)
WHERE cloudflare_deleted_at IS NULL
  AND stream_deleted_at IS NOT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS replay_status text,
  ADD COLUMN IF NOT EXISTS playback_provider text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS replay_ready boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS processing_message text;

DROP POLICY IF EXISTS "live_replays_public_read_ready" ON public.live_replays;

CREATE POLICY "live_replays_public_read_ready"
  ON public.live_replays
  FOR SELECT
  USING (
    status IN ('ready', 'archived', 'posted')
    OR archive_status IN ('archived', 'replay_posted', 'stream_deleted')
  );

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_archive_status
  ON public.live_sessions (streaming_mode, archive_status, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_posts_replay_status
  ON public.posts (replay_status, replay_ready, updated_at);
```

### 4.2 R2 playable verification

File: `supabase/functions/_shared/r2StorageService.ts`

```ts
export async function verifyR2PlayableUrl(url: string, expectedMinBytes = 1): Promise<{
  ok: boolean
  status: number
  contentLength: number | null
  error?: string
}> {
  try {
    const head = await fetch(url, { method: 'HEAD' })
    const lengthHeader = head.headers.get('content-length')
    const contentLength = lengthHeader ? Number(lengthHeader) : null

    if (head.ok && (contentLength === null || contentLength >= expectedMinBytes)) {
      return {
        ok: true,
        status: head.status,
        contentLength,
      }
    }

    const range = await fetch(url, {
      headers: {
        Range: 'bytes=0-1023',
      },
    })

    return {
      ok: range.ok || range.status === 206,
      status: range.status,
      contentLength,
      error: range.ok || range.status === 206 ? undefined : `R2 playable check failed: ${range.status}`,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentLength: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
```

### 4.3 End RTMP live: chuyển post sang processing, chưa render replay player

File: `supabase/functions/end-rtmp-live-session/index.ts`

Các điểm cần có:

```ts
await admin.from('live_replays').upsert(
  {
    live_session_id: session.id,
    user_id: session.user_id,
    post_id: livePost.id,
    title: session.title,
    description: session.description,
    streaming_mode: 'rtmp',
    cloudflare_video_uid: session.cloudflare_video_uid,
    cloudflare_stream_url: session.playback_url || session.hls_url || null,
    r2_video_url: session.r2_video_url || null,
    r2_object_key: session.r2_object_key || null,
    r2_bucket: session.r2_bucket || null,
    status: 'processing',
    archive_status: shouldArchivePublicLive ? 'pending' : 'skipped',
    archive_error: null,
  },
  { onConflict: 'live_session_id' },
)

await admin
  .from('live_sessions')
  .update({
    status: 'ended',
    archive_status: shouldArchivePublicLive ? 'pending' : session.archive_status,
    archive_error: null,
    ended_at: now,
    updated_at: now,
  })
  .eq('id', session.id)
```

Update post đang live thành replay processing:

```ts
await admin
  .from('posts')
  .update({
    live_status: 'ended',
    video_url: null,
    replay_status: 'processing',
    playback_provider: 'r2',
    replay_ready: false,
    processing_message: 'Dang xu ly video replay. Video se san sang sau it phut.',
    metadata: {
      ...metadata,
      live_status: 'ended',
      replay_status: 'processing',
      replay_ready: false,
      playback_provider: 'r2',
      storage_provider: 'r2',
      processing_message: 'Dang xu ly video replay. Video se san sang sau it phut.',
    },
    updated_at: now,
  })
  .eq('id', livePost.id)
```

### 4.4 Archive service lifecycle steps

File: `supabase/functions/_shared/archiveReplayService.ts`

Thêm constants cho lifecycle:

```ts
const ArchiveStep = {
  PROCESSING_STREAM: 'processing_stream',
  STREAM_READY: 'stream_ready',
  EXPORTING_MP4: 'exporting_mp4',
  UPLOADING_R2: 'uploading_r2',
  VERIFYING_R2: 'verifying_r2',
  ARCHIVED: 'archived',
  REPLAY_POSTED: 'replay_posted',
  STREAM_DELETED: 'stream_deleted',
  FAILED: 'failed',
} as const
```

Helper cập nhật cùng lúc `live_replays` và `live_sessions`:

```ts
async function markArchiveStep(
  admin: SupabaseClient,
  replay: LiveReplay,
  step: string,
  patch: Record<string, unknown> = {},
) {
  const updatedAt = new Date().toISOString()

  await admin
    .from('live_replays')
    .update({
      archive_status: step,
      updated_at: updatedAt,
      ...patch,
    })
    .eq('id', replay.id)

  await admin
    .from('live_sessions')
    .update({
      status: step,
      archive_status: step,
      updated_at: updatedAt,
      ...patch,
    })
    .eq('id', replay.live_session_id)

  console.log('[RTMP_REPLAY_ARCHIVE_STEP]', {
    replayId: replay.id,
    liveSessionId: replay.live_session_id,
    step,
    hasR2Url: Boolean(patch.r2_video_url),
    hasCloudflareUid: Boolean(replay.cloudflare_video_uid),
  })
}
```

Delete Cloudflare Stream sau khi R2 ready:

```ts
async function deleteCloudflareStreamAfterArchive(
  admin: SupabaseClient,
  replay: LiveReplay,
  videoUid: string | null,
) {
  if (!videoUid) return

  const deletedAt = new Date().toISOString()

  try {
    await deleteStreamVideo(videoUid)

    await admin
      .from('live_replays')
      .update({
        archive_status: ArchiveStep.STREAM_DELETED,
        stream_deleted_at: deletedAt,
        cloudflare_deleted_at: deletedAt,
        delete_stream_error: null,
        updated_at: deletedAt,
      })
      .eq('id', replay.id)

    await admin
      .from('live_sessions')
      .update({
        status: ArchiveStep.STREAM_DELETED,
        archive_status: ArchiveStep.STREAM_DELETED,
        stream_deleted_at: deletedAt,
        cloudflare_deleted_at: deletedAt,
        delete_stream_error: null,
        updated_at: deletedAt,
      })
      .eq('id', replay.live_session_id)

    console.log('[RTMP_REPLAY_STREAM_DELETED]', {
      replayId: replay.id,
      liveSessionId: replay.live_session_id,
      videoUid,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await admin
      .from('live_replays')
      .update({
        delete_stream_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', replay.id)

    await admin
      .from('live_sessions')
      .update({
        delete_stream_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', replay.live_session_id)

    console.warn('[RTMP_REPLAY_STREAM_DELETE_FAILED]', {
      replayId: replay.id,
      liveSessionId: replay.live_session_id,
      videoUid,
      error: message,
    })
  }
}
```

Core flow trong archive job:

```ts
await markArchiveStep(admin, replay, ArchiveStep.EXPORTING_MP4, {
  archive_attempts: (replay.archive_attempts || 0) + 1,
  archive_error: null,
  cloudflare_stream_url: playbackUrl,
  cloudflare_thumbnail_url: thumbnailUrl,
})

const exportResult = await requestMp4Export(videoUid)
const download = await pollMp4DownloadUrl(videoUid, exportResult.exportId)

await markArchiveStep(admin, replay, ArchiveStep.STREAM_READY, {
  cloudflare_stream_url: playbackUrl,
  cloudflare_thumbnail_url: thumbnailUrl,
})

await markArchiveStep(admin, replay, ArchiveStep.UPLOADING_R2)

const uploaded = await uploadStreamMp4ToR2({
  sourceUrl: download.downloadUrl,
  liveSessionId: replay.live_session_id,
  userId: replay.user_id,
})

await markArchiveStep(admin, replay, ArchiveStep.VERIFYING_R2, {
  r2_object_key: uploaded.key,
  r2_bucket: uploaded.bucket,
  r2_video_url: uploaded.url,
})

const playable = await verifyR2PlayableUrl(uploaded.url, Math.max(1, Math.min(uploaded.size, 1024)))

if (!playable.ok) {
  throw new Error(playable.error || `R2 playable verification failed with status ${playable.status}`)
}

const readyAt = new Date().toISOString()

await admin
  .from('live_replays')
  .update({
    status: 'ready',
    archive_status: ArchiveStep.ARCHIVED,
    playback_provider: 'r2',
    storage_provider: 'r2',
    r2_object_key: uploaded.key,
    r2_bucket: uploaded.bucket,
    r2_video_url: uploaded.url,
    r2_verified_at: readyAt,
    replay_ready_at: readyAt,
    archived_at: readyAt,
    archive_error: null,
    updated_at: readyAt,
  })
  .eq('id', replay.id)

await updateReplayPostFromArchive(admin, replay, {
  r2VideoUrl: uploaded.url,
  r2ObjectKey: uploaded.key,
  r2Bucket: uploaded.bucket,
  thumbnailUrl,
})

await admin
  .from('live_replays')
  .update({
    archive_status: ArchiveStep.REPLAY_POSTED,
    updated_at: new Date().toISOString(),
  })
  .eq('id', replay.id)

await admin
  .from('live_sessions')
  .update({
    status: ArchiveStep.REPLAY_POSTED,
    archive_status: ArchiveStep.REPLAY_POSTED,
    playback_provider: 'r2',
    storage_provider: 'r2',
    r2_object_key: uploaded.key,
    r2_bucket: uploaded.bucket,
    r2_video_url: uploaded.url,
    r2_archived_at: readyAt,
    replay_ready_at: readyAt,
    archive_error: null,
    updated_at: readyAt,
  })
  .eq('id', replay.live_session_id)

await deleteCloudflareStreamAfterArchive(admin, replay, videoUid)
```

### 4.5 Update replay post sau archive

File: `supabase/functions/_shared/replayFeedService.ts`

```ts
await admin
  .from('posts')
  .update({
    video_url: archive.r2VideoUrl,
    thumbnail_url: archive.thumbnailUrl || null,
    replay_status: 'ready',
    playback_provider: 'r2',
    replay_ready: true,
    processing_message: null,
    metadata: {
      ...metadata,
      live_status: 'ended',
      replay_status: 'ready',
      archive_status: 'archived',
      playback_provider: 'r2',
      storage_provider: 'r2',
      replay_ready: true,
      r2_video_url: archive.r2VideoUrl,
      r2_object_key: archive.r2ObjectKey,
      r2_bucket: archive.r2Bucket,
      thumbnail_url: archive.thumbnailUrl || null,
      processing_message: null,
    },
    updated_at: new Date().toISOString(),
  })
  .eq('id', replay.post_id)
```

### 4.6 Feed/player guard để không loading vô hạn

File: `src/components/feed/PostMedia.tsx`

Logic cần có:

```ts
const isEndedLive = post.live_status === 'ended'

const isR2ReplayReady =
  isEndedLive &&
  (post.replay_ready === true || metadata.replay_ready === true) &&
  (post.replay_status === 'ready' || metadata.replay_status === 'ready') &&
  (post.playback_provider === 'r2' || metadata.playback_provider === 'r2') &&
  Boolean(metadata.r2_video_url || post.video_url)

const replayStatusText =
  post.processing_message ||
  metadata.processing_message ||
  (post.replay_status === 'failed' || metadata.replay_status === 'failed'
    ? 'Video replay dang gap loi xu ly. Vui long thu lai sau.'
    : 'Dang xu ly video replay. Video se san sang sau it phut.')

const liveVideoUrl = isEndedLive
  ? isR2ReplayReady
    ? metadata.r2_video_url || post.video_url
    : null
  : post.video_url || metadata.playback_url || metadata.hls_url
```

Render ended replay:

```tsx
{isEndedLive && !isR2ReplayReady ? (
  <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 bg-black/90 text-white">
    <Loader2 className="h-8 w-8 animate-spin text-white/80" />
    <div className="text-center">
      <p className="font-semibold">Dang xu ly video replay</p>
      <p className="text-sm text-white/70">{replayStatusText}</p>
    </div>
  </div>
) : (
  <ReplayPlayer
    src={liveVideoUrl}
    poster={post.thumbnail_url || metadata.thumbnail_url}
    controls
    preload="metadata"
  />
)}
```

### 4.7 Realtime hydrate replay only when R2 ready

File: `src/hooks/live/useLiveReplayStatus.ts`

```ts
const readyArchiveStatuses = ['archived', 'replay_posted', 'stream_deleted']

const applyReadyReplay = (row: LiveReplayRow) => {
  const archiveReady = readyArchiveStatuses.includes(row.archive_status || '')
  const replayReady = row.status === 'ready' && archiveReady && Boolean(row.r2_video_url)

  if (!replayReady) return

  setOverride({
    video_url: row.r2_video_url,
    thumbnail_url: row.cloudflare_thumbnail_url,
    playback_provider: 'r2',
    replay_status: 'ready',
    replay_ready: true,
    archive_status: 'archived',
  })
}
```

Initial query:

```ts
const { data, error } = await supabase
  .from('live_replays')
  .select('*')
  .eq('live_session_id', liveSessionId)
  .eq('status', 'ready')
  .in('archive_status', ['archived', 'replay_posted', 'stream_deleted'])
  .maybeSingle()
```

Realtime subscription phải luôn đăng ký `.on(...)` trước `.subscribe()`:

```ts
const channel = supabase
  .channel(channelName)
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'live_replays',
      filter: `live_session_id=eq.${liveSessionId}`,
    },
    (payload) => {
      applyReadyReplay(payload.new as LiveReplayRow)
    },
  )
  .subscribe((status, error) => {
    if (error) {
      console.warn('[live-replay-status] realtime subscribe failed', error)
    }
  })

return () => {
  supabase.removeChannel(channel)
}
```

### 4.8 Cron worker retry statuses

File: `supabase/functions/live-replay-archive-cron/index.ts`

Cron cần retry các trạng thái đang xử lý hoặc failed:

```ts
const eligibleArchiveStatuses = [
  'pending',
  'failed',
  'archiving',
  'processing_stream',
  'stream_ready',
  'exporting_mp4',
  'uploading_r2',
  'verifying_r2',
]
```

Recover missing RTMP replays:

```ts
.in('status', [
  'ended',
  'processing',
  'archiving',
  'processing_stream',
  'stream_ready',
  'exporting_mp4',
  'uploading_r2',
  'verifying_r2',
])
```

## 5. Flow mới

### Khi user kết thúc RTMP live

1. `end-rtmp-live-session` set `live_sessions.status = ended`.
2. `live_replays` được upsert với `archive_status = pending`.
3. Live post trên feed chuyển thành replay processing:
   - `replay_status = processing`
   - `playback_provider = r2`
   - `replay_ready = false`
   - `video_url = null`
4. UI feed hiển thị: “Đang xử lý video replay. Video sẽ sẵn sàng sau ít phút.”

### Khi background archive chạy

1. Poll/check Cloudflare Stream video.
2. Khi video ready, request MP4 export.
3. Poll download URL.
4. Upload MP4 sang R2 bằng streaming/chunked.
5. HEAD/range verify R2 playable.
6. Update `live_replays`, `live_sessions`, `posts` sang R2 ready.
7. Supabase Realtime/polling hydrate feed.
8. Sau khi post update OK, delete Cloudflare Stream video.
9. Mark `stream_deleted`.

## 6. Khi nào delete Cloudflare Stream video?

Chỉ delete khi tất cả điều kiện sau đúng:

- Có `cloudflare_video_uid`.
- MP4 đã upload sang R2.
- R2 playable verify OK.
- `posts.video_url` đã trỏ sang R2.
- `replay_ready = true`.
- DB update thành công.

Không delete nếu:

- Export fail.
- Upload R2 fail.
- Verify R2 fail.
- Update post fail.

Delete phải idempotent: nếu Cloudflare báo video đã bị xóa thì không crash UI, chỉ log kết quả hoặc lưu `delete_stream_error`.

## 7. Error handling

Nếu export/upload/verify/delete lỗi:

- Update `archive_status = failed` nếu lỗi thuộc archive chính.
- Lưu `archive_error`.
- Không throw lỗi ra frontend.
- Feed vẫn hiển thị trạng thái xử lý/lỗi thân thiện.
- Cron có thể retry.
- Không xóa Cloudflare Stream video trước khi R2 replay OK.

Không log:

- Stream key.
- Cloudflare token.
- R2 secret.
- Signed URL dài hạn.

Log an toàn:

- `liveSessionId`
- `replayId`
- `archive_status`
- `hasR2Url`
- `hasCloudflareUid`
- `delete result`

## 8. Test checklist production

1. User live RTMP bằng OBS, public live hoạt động bình thường.
2. Kết thúc live, replay card hiện “Đang xử lý video replay”.
3. Cloudflare Stream recording chuyển READY.
4. MP4 export OK.
5. Upload R2 thành công.
6. R2 HEAD/range verify OK.
7. Feed tự update thành replay playable từ R2.
8. Cloudflare Stream video bị delete tự động sau khi post ready.
9. Reload feed không loading vô hạn.
10. Replay vẫn phát bình thường sau khi Cloudflare Stream video đã bị delete.
11. Replay dài hơn 2 giờ vẫn archive được, không load full MP4 vào RAM.
12. Upload fail thì `archive_status = failed`, `archive_error` có message, Cloudflare Stream video chưa bị delete.
13. Chuyển route rồi quay lại feed không duplicate realtime subscription.
14. Nhiều replay processing cùng lúc không crash feed/profile.

## 9. Rollback

Rollback an toàn nếu archive pipeline lỗi:

1. Tắt cron `live-replay-archive-cron`.
2. Không chạy delete Cloudflare Stream video.
3. Giữ các post đang processing, không render player khi R2 chưa ready.
4. Có thể retry lại archive sau khi fix bằng cách set:

```sql
UPDATE public.live_replays
SET archive_status = 'pending',
    archive_error = NULL,
    updated_at = now()
WHERE live_session_id = '<LIVE_SESSION_ID>';
```

5. Nếu cần rollback UI guard, vẫn nên giữ nguyên rule “không render player khi source null” để tránh infinite spinner.

## 10. File đã sửa trong implementation

- `src/components/feed/PostMedia.tsx`
- `src/hooks/live/useLiveReplayStatus.ts`
- `supabase/functions/_shared/archiveReplayService.ts`
- `supabase/functions/_shared/r2StorageService.ts`
- `supabase/functions/_shared/replayFeedService.ts`
- `supabase/functions/end-rtmp-live-session/index.ts`
- `supabase/functions/live-replay-archive-cron/index.ts`
- `supabase/migrations/20260511000100_rtmp_replay_archive_lifecycle.sql`

## 11. Verification đã chạy

```bash
npx tsc --noEmit
```

Kết quả: pass.

