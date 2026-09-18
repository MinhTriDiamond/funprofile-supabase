# RTMP Replay Archive Cleanup Watchdog

Tài liệu này đóng gói tính năng **RTMP Replay Archive Cleanup Watchdog** cho FUN Profile để gửi Lovable. Tính năng này bổ sung lớp dọn dẹp an toàn cho pipeline RTMP replay archive: replay cuối cùng phát từ Cloudflare R2, còn video Cloudflare Stream đã archive xong sẽ được xóa tự động để tiết kiệm chi phí.

## 1. Tên tính năng

**RTMP Replay Archive Cleanup Watchdog**

Tên đầy đủ:

**RTMP Replay Archive Pipeline with Cloudflare Stream Cleanup Watchdog**

Tên tiếng Việt:

**Pipeline lưu replay RTMP sang R2 và tự dọn video Cloudflare Stream còn sót**

## 2. Mục tiêu

Sau khi user livestream RTMP bằng OBS/Restream/vMix và kết thúc live:

```txt
Cloudflare Stream xử lý video
  -> Video READY
  -> Export/download MP4
  -> Upload MP4 sang Cloudflare R2
  -> Verify R2 object/playback URL
  -> Update replay post dùng R2
  -> Delete video khỏi Cloudflare Stream
  -> Watchdog retry delete nếu delete bị miss
```

Quy tắc bắt buộc:

- Replay cuối cùng phải phát từ R2.
- Không tạo replay post bằng Cloudflare Stream URL.
- Không render player nếu R2 chưa ready.
- Không xóa Cloudflare Stream video trước khi R2 upload + verify + DB update thành công.
- Nếu delete Cloudflare Stream fail, replay vẫn publish từ R2, lưu `delete_stream_error`, watchdog retry sau.

## 3. Audit hiện tại

Các file/path liên quan:

| File | Vai trò |
| --- | --- |
| `supabase/functions/_shared/archiveReplayService.ts` | Archive MP4 sang R2, verify R2, update replay, delete Cloudflare Stream video, watchdog cleanup |
| `supabase/functions/_shared/r2StorageService.ts` | Upload/head/delete/list R2 object, verify playable URL |
| `supabase/functions/_shared/replayFeedService.ts` | Update replay post sau khi R2 ready |
| `supabase/functions/live-replay-archive-cron/index.ts` | Cron archive retry + cleanup watchdog |
| `src/components/feed/PostMedia.tsx` | Feed render live/replay media, tránh player null source |
| `src/components/feed/FacebookPostCard.tsx` | Realtime replay hydrate cho live/live_replay |
| `supabase/migrations/20260512000200_rtmp_replay_cleanup_watchdog.sql` | Index + cron schedule cleanup watchdog |

Điểm đã đúng:

- Archive pipeline đã có các bước export MP4, upload R2, verify R2, update DB, update replay post.
- Replay feed đã tránh render video khi R2 chưa ready.
- Supabase Realtime hydrate replay khi `archive_status` ready.

Điểm thiếu trước khi bổ sung watchdog:

- Nếu Cloudflare DELETE fail hoặc bị miss, video đã archive R2 vẫn còn trên Cloudflare Stream.
- Chưa có background job độc lập để dọn các video Cloudflare Stream còn sót.
- Replay post sau archive vẫn đang dùng `post_type = 'live'`; cần tách thành `post_type = 'live_replay'`.
- `r2StorageService.ts` từng có hàm `verifyR2PlayableUrl` trùng tên; cần giữ một bản duy nhất.

## 4. Flow mới

### 4.1 Archive chính

```txt
live_replays.archive_status = pending/failed
  -> archiveReplay()
  -> poll Cloudflare MP4 download URL
  -> fetch MP4 stream
  -> upload MP4 sang R2
  -> verify R2 object HEAD
  -> verify R2 playback URL HEAD/range
  -> live_replays.status = ready
  -> live_replays.archive_status = archived
  -> posts.post_type = live_replay
  -> posts.video_url = r2_video_url
  -> delete Cloudflare Stream video
  -> archive_status = stream_deleted
```

### 4.2 Cleanup watchdog

```txt
Cron mỗi 5 phút
  -> tìm replay đã archive sang R2 nhưng Cloudflare video chưa delete
  -> verify R2 object tồn tại
  -> verify R2 playback URL usable
  -> gọi Cloudflare DELETE video
  -> 404 coi như success
  -> update stream_deleted_at/cloudflare_deleted_at
  -> clear delete_stream_error
```

Không delete nếu:

- R2 object missing.
- R2 playback URL không usable.
- `playback_provider != 'r2'`.
- `storage_provider != 'r2'`.
- Thiếu `r2_object_key` hoặc `r2_video_url`.

## 5. Database migration

File: `supabase/migrations/20260512000200_rtmp_replay_cleanup_watchdog.sql`

```sql
-- RTMP replay archive cleanup watchdog.
-- Ensures R2-ready replays can be rendered as live_replay posts and Cloudflare Stream leftovers are retried.

CREATE INDEX IF NOT EXISTS idx_live_replays_archived_stream_cleanup_watchdog
  ON public.live_replays (archive_status, playback_provider, storage_provider, updated_at)
  WHERE cloudflare_video_uid IS NOT NULL
    AND r2_object_key IS NOT NULL
    AND r2_video_url IS NOT NULL
    AND (stream_deleted_at IS NULL OR cloudflare_deleted_at IS NULL OR delete_stream_error IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_posts_live_replay_ready
  ON public.posts (post_type, replay_status, replay_ready, updated_at)
  WHERE post_type IN ('live', 'live_replay');

SELECT cron.unschedule('rtmp-replay-archive-cleanup-every-5min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rtmp-replay-archive-cleanup-every-5min');

SELECT cron.schedule(
  'rtmp-replay-archive-cleanup-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-replay-archive-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <SUPABASE_ANON_OR_SERVICE_ROLE_TOKEN>"}'::jsonb,
    body:='{"limit":5,"cleanup_limit":25}'::jsonb
  );
  $$
);
```

Production note: nếu có `CRON_SECRET`, nên dùng `X-Cron-Secret` thay vì hardcode token trong migration.

## 6. R2 verify service

File: `supabase/functions/_shared/r2StorageService.ts`

Giữ một hàm verify duy nhất:

```ts
export interface R2PlayableCheck {
  ok: boolean;
  status: number;
  contentLength: number | null;
  error?: string;
}

/**
 * Verify R2 object thực sự playable: HEAD trước, fallback Range bytes=0-1023.
 * Dùng trước khi đánh dấu replay archived/replay_posted để tránh feed render player rỗng.
 */
export async function verifyR2PlayableUrl(url: string, expectedMinBytes = 1): Promise<R2PlayableCheck> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const lengthHeader = head.headers.get('content-length');
    const contentLength = lengthHeader ? Number(lengthHeader) : null;
    if (head.ok && (contentLength === null || contentLength >= expectedMinBytes)) {
      return { ok: true, status: head.status, contentLength };
    }

    const range = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
    try { await range.body?.cancel(); } catch { /* ignore */ }
    const ok = range.ok || range.status === 206;
    return {
      ok,
      status: range.status,
      contentLength,
      error: ok ? undefined : `R2 playable check failed: HEAD ${head.status} / Range ${range.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentLength: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

## 7. Archive service: delete Stream sau archive

File: `supabase/functions/_shared/archiveReplayService.ts`

```ts
export async function deleteCloudflareStreamAfterArchive(
  admin: SupabaseClient,
  replay: any,
  uid: string,
): Promise<void> {
  if (!uid || (replay.stream_deleted_at && replay.cloudflare_deleted_at)) return;

  try {
    const result = await deleteStreamVideo(uid);
    const deletedAt = new Date().toISOString();

    await (admin as any).from('live_replays').update({
      stream_deleted_at: deletedAt,
      cloudflare_deleted_at: deletedAt,
      delete_stream_error: null,
      archive_status: ArchiveStep.STREAM_DELETED,
    }).eq('id', replay.id);

    await admin.from('live_sessions').update({
      status: ArchiveStep.STREAM_DELETED,
      archive_status: ArchiveStep.STREAM_DELETED,
      stream_deleted_at: deletedAt,
      cloudflare_deleted_at: deletedAt,
      delete_stream_error: null,
    }).eq('id', replay.live_session_id);

    console.log('[RTMP_REPLAY_STREAM_DELETED]', {
      replay_id: replay.id,
      live_session_id: replay.live_session_id,
      uid,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await (admin as any).from('live_replays').update({
      delete_stream_error: message.slice(0, 1000),
    }).eq('id', replay.id);

    await admin.from('live_sessions').update({
      delete_stream_error: message.slice(0, 1000),
    }).eq('id', replay.live_session_id);

    console.warn('[RTMP_REPLAY_STREAM_DELETE_FAILED]', {
      replay_id: replay.id,
      live_session_id: replay.live_session_id,
      uid,
      error: message,
    });
  }
}
```

Điểm quan trọng:

- Hàm này idempotent.
- Nếu đã có cả `stream_deleted_at` và `cloudflare_deleted_at` thì bỏ qua.
- `deleteStreamVideo` coi Cloudflare `404` là success.
- Nếu delete fail, replay vẫn phát từ R2.

## 8. Archive service: cleanup watchdog

File: `supabase/functions/_shared/archiveReplayService.ts`

```ts
export async function cleanupArchivedStreamVideos(admin: SupabaseClient, limit = 10): Promise<{
  scanned: number;
  deleted: number;
  skipped: number;
  failed: number;
  results: Array<Record<string, unknown>>;
}> {
  const { data: replays, error } = await (admin as any)
    .from('live_replays')
    .select('*')
    .in('archive_status', ['archived', 'replay_posted', 'stream_deleted'])
    .eq('playback_provider', 'r2')
    .eq('storage_provider', 'r2')
    .not('r2_object_key', 'is', null)
    .not('r2_video_url', 'is', null)
    .not('cloudflare_video_uid', 'is', null)
    .or('stream_deleted_at.is.null,cloudflare_deleted_at.is.null,delete_stream_error.not.is.null')
    .order('updated_at', { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 10, 50)));
  if (error) throw error;

  const results: Array<Record<string, unknown>> = [];
  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (const replay of replays || []) {
    const uid = replay.stream_uid || replay.cloudflare_video_uid;
    if (!uid) {
      skipped++;
      results.push({ replay_id: replay.id, status: 'skipped_missing_uid' });
      continue;
    }

    try {
      const object = await headR2Object(replay.r2_object_key);
      if (!object.exists || object.size <= 0) {
        skipped++;
        results.push({ replay_id: replay.id, status: 'skipped_r2_missing', r2_object_key: replay.r2_object_key });
        continue;
      }

      const playable = await verifyR2PlayableUrl(replay.r2_video_url, 1);
      if (!playable.ok) {
        skipped++;
        results.push({ replay_id: replay.id, status: 'skipped_r2_not_playable', r2_status: playable.status });
        continue;
      }

      await deleteCloudflareStreamAfterArchive(admin, replay, uid);
      deleted++;
      results.push({ replay_id: replay.id, live_session_id: replay.live_session_id, status: 'stream_deleted', uid });
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);

      await (admin as any).from('live_replays').update({
        delete_stream_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq('id', replay.id);

      if (replay.live_session_id) {
        await admin.from('live_sessions').update({
          delete_stream_error: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq('id', replay.live_session_id);
      }

      results.push({ replay_id: replay.id, status: 'failed', error: message });
      console.warn('[CLEANUP_ARCHIVED_STREAM_VIDEO_FAILED]', {
        replay_id: replay.id,
        live_session_id: replay.live_session_id,
        uid,
        error: message,
      });
    }
  }

  console.log('[CLEANUP_ARCHIVED_STREAM_VIDEOS]', {
    scanned: (replays || []).length,
    deleted,
    skipped,
    failed,
  });

  return { scanned: (replays || []).length, deleted, skipped, failed, results };
}
```

## 9. Cron integration

File: `supabase/functions/live-replay-archive-cron/index.ts`

Import:

```ts
import { archiveReplay, cleanupArchivedStreamVideos } from '../_shared/archiveReplayService.ts';
```

Handler:

```ts
const { replay_id, limit = 5, cleanup_limit = 10 } = await req.json().catch(() => ({}));

const auto_ended_rtmp_sessions = await autoEndDisconnectedRtmpSessions(admin as any);
const recovered_rtmp_replays = await recoverMissingRtmpReplays(admin as any);

const cleanup_archived_stream_videos = await cleanupArchivedStreamVideos(admin as any, cleanup_limit).catch((error) => ({
  scanned: 0,
  deleted: 0,
  skipped: 0,
  failed: 1,
  results: [{ status: 'cleanup_failed', error: error instanceof Error ? error.message : String(error) }],
}));

return json({
  ok: true,
  auto_ended_rtmp_sessions,
  recovered_rtmp_replays,
  cleanup_archived_stream_videos,
  processed: results.length,
  results,
});
```

## 10. Replay post dùng live_replay

File: `supabase/functions/_shared/replayFeedService.ts`

Khi R2 ready:

```ts
const metadata = {
  ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
  live_title: liveSession.title,
  live_status: 'ended',
  live_mode: (liveSession as any).mode || 'agora_webcam',
  live_session_id: replay.live_session_id,
  replay_id: replay.id,
  replay_badge: 'REPLAY',
  badge: 'REPLAY',
  post_type: 'live_replay',
  playback_url: r2Url,
  playback_type: 'r2',
  playback_provider: 'r2',
  storage_provider: 'r2',
  archive_status: 'archived',
  replay_status: 'ready',
  replay_ready: true,
  processing_message: null,
  r2_video_url: r2Url,
  r2_object_key: replay.r2_object_key,
  r2_bucket: replay.r2_bucket,
  stream_uid: replay.stream_uid || replay.cloudflare_video_uid,
  cloudflare_video_uid: replay.stream_uid || replay.cloudflare_video_uid,
  thumbnail_url: replay.thumbnail_url,
  duration_seconds: replay.duration_seconds,
  archived_at: replay.archived_at || new Date().toISOString(),
  posted_at: replay.posted_at || replay.auto_posted_at || new Date().toISOString(),
  ended_at: liveSession.ended_at || new Date().toISOString(),
};

await admin.from('posts').update({
  video_url: r2Url,
  image_url: null,
  post_type: 'live_replay',
  replay_status: 'ready',
  playback_provider: 'r2',
  thumbnail_url: replay.thumbnail_url || null,
  replay_ready: true,
  processing_message: null,
  metadata,
}).eq('id', postId);
```

## 11. Frontend feed support

File: `src/components/feed/PostMedia.tsx`

```ts
const isLive = post.post_type === 'live' || post.post_type === 'live_replay';
```

File: `src/components/feed/FacebookPostCard.tsx`

```ts
const isLivePost = post.post_type === 'live' || post.post_type === 'live_replay';
```

Live chat replay:

```tsx
{(post.post_type === 'live' || post.post_type === 'live_replay') && post.metadata?.live_session_id && (
  <div className="max-h-[300px] rounded-lg overflow-hidden border border-border mb-3">
    <LiveChatReplay sessionId={post.metadata.live_session_id} />
  </div>
)}
```

## 12. Idempotency

Pipeline idempotent theo các điểm:

- R2 object đã tồn tại: archive self-heal verify rồi reuse.
- Replay post đã tồn tại: update post cũ, không duplicate.
- Creator library upsert theo `live_replay_id`.
- Delete Cloudflare Stream video 404: coi như success.
- Cleanup watchdog chỉ chạy khi R2 object và R2 playback verify OK.
- Nếu delete fail: lưu `delete_stream_error`, retry sau.

## 13. Retry strategy

Archive retry:

- MP4 chưa ready: retry sau 10 phút.
- Lỗi khác: exponential backoff qua `archive_next_retry_at`.
- Vượt ngưỡng hoặc Stream UID 404 nhiều lần: `archive_status = unrecoverable`.

Delete retry:

- Nếu delete Stream fail: không fail replay, chỉ set `delete_stream_error`.
- Watchdog cron retry mỗi 5 phút.
- Chỉ retry delete nếu R2 vẫn OK.

## 14. Logging

Log an toàn:

- `replay_id`
- `live_session_id`
- `cloudflare_video_uid`
- `archive_status`
- `stream_deleted`
- `cleanup result`
- retry count/status

Không log:

- Cloudflare token.
- R2 access key/secret.
- Stream key.
- Signed URL nhạy cảm.

## 15. Test checklist

Archive replay:

1. Start OBS live RTMP.
2. Bấm “Phát trực tiếp”.
3. Kết thúc live.
4. Feed hiển thị “Đang xử lý video replay”.
5. Cloudflare Stream video chuyển READY.
6. Cron export/download MP4.
7. MP4 upload sang R2.
8. R2 HEAD OK.
9. R2 playback URL usable.
10. Post chuyển `post_type = live_replay`.
11. `video_url = r2_video_url`.
12. Replay phát từ R2 sau reload.

Cleanup watchdog:

1. Tạo replay đã R2 ready nhưng để `stream_deleted_at = null`.
2. Chạy `live-replay-archive-cron` với body:

```json
{
  "limit": 5,
  "cleanup_limit": 25
}
```

3. Kiểm tra response `cleanup_archived_stream_videos.deleted`.
4. Kiểm tra DB:
   - `stream_deleted_at` có giá trị.
   - `cloudflare_deleted_at` có giá trị.
   - `delete_stream_error = null`.
5. Kiểm tra Cloudflare Stream dashboard video đã biến mất.

Failure cases:

- R2 missing: watchdog skip, không delete Stream.
- R2 playback fail: watchdog skip.
- Cloudflare DELETE fail: set `delete_stream_error`, retry sau.
- Cloudflare DELETE 404: coi như success.

## 16. Recovery nếu lỗi

Replay archive fail:

```sql
UPDATE public.live_replays
SET archive_status = 'pending',
    archive_error = NULL,
    archive_next_retry_at = now(),
    updated_at = now()
WHERE id = '<LIVE_REPLAY_ID>';
```

Retry cleanup delete:

```sql
UPDATE public.live_replays
SET delete_stream_error = NULL,
    stream_deleted_at = NULL,
    cloudflare_deleted_at = NULL,
    updated_at = now()
WHERE id = '<LIVE_REPLAY_ID>'
  AND playback_provider = 'r2'
  AND storage_provider = 'r2'
  AND r2_object_key IS NOT NULL;
```

Tắt watchdog:

```sql
SELECT cron.unschedule('rtmp-replay-archive-cleanup-every-5min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rtmp-replay-archive-cleanup-every-5min');
```

## 17. Verification

Đã chạy:

```bash
npx tsc --noEmit
```

Kết quả: pass.

Không chạy được:

```bash
deno check
```

Lý do: máy local không có `deno` trong PATH.

## 18. Files changed

- `src/components/feed/FacebookPostCard.tsx`
- `src/components/feed/PostMedia.tsx`
- `supabase/functions/_shared/archiveReplayService.ts`
- `supabase/functions/_shared/r2StorageService.ts`
- `supabase/functions/_shared/replayFeedService.ts`
- `supabase/functions/live-replay-archive-cron/index.ts`
- `supabase/migrations/20260512000200_rtmp_replay_cleanup_watchdog.sql`

