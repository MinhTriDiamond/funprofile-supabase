# RTMP Replay Long R2 Archive Fix

Tai lieu nay dong goi fix **Sửa Archive R2 Cho RTMP Replay Dài Hơn 2 Giờ** cho Fun Profile de gui sang Lovable.

## Ten tinh nang/fix

**RTMP Replay Long R2 Archive Fix**

Ten day du:

**Long RTMP Replay Cloudflare Stream To R2 Multipart Archive Repair**

## Van de thuc te

Replay RTMP dai hon 2 gio van hien thong bao:

```text
Đang tối ưu video replay trong nền. Bạn vẫn có thể xem lại ngay.
```

Trong khi:

- Cloudflare Stream video da `Ready`.
- Video tam thoi van xem duoc bang Cloudflare Stream.
- Post tren feed/profile chua chuyen sang `playback_provider='r2'`.
- Video co the bi ket hang gio, lam user nghi archive khong hoat dong.

## Nguyen nhan audit

Pipeline archive hien co da co du cac buoc:

```text
Cloudflare Stream READY
-> request MP4 download
-> poll MP4 ready
-> upload MP4 sang R2
-> verify R2
-> update post sang R2
-> xoa Cloudflare Stream UID
```

Nhung video RTMP dai co cac diem de ket:

1. Multipart cu dung part `64MB`, moi cron tick chi upload 1 part. Video hon 2 gio co the can rat nhieu part.
2. Edge Function de gap gioi han thoi gian/memory khi fetch + upload chunk lon.
3. Neu replay ket o `mp4_wait`, archive cron cu chi doi MP4 poll cron rieng.
4. Multipart 64MB cu neu fail nhieu lan khong co co che restart sang part nho hon.
5. Admin debug chua nhan `post_id/post URL`, trong khi case thuc te thuong chi thay post dang ket tren feed.
6. UI overlay chi hien message chung, khong hien progress R2.

## Muc tieu fix

- Multipart R2 mac dinh `32MB` cho replay moi.
- Moi cron tick upload 1-2 part theo time budget de tranh timeout.
- Fetch Cloudflare MP4 range bang stream, khong doc full chunk lon vao memory.
- `archiveReplay` tu poll MP4 khi replay o `mp4_wait` de self-heal neu MP4 poll cron bi miss.
- Replay dang multipart cu 64MB neu ket qua 30 phut hoac fail nhieu lan se abort va restart bang part 32MB.
- Admin co the diagnose/repair bang `post_id` hoac post URL.
- Feed hien progress dang luu sang R2, vi du:

```text
Đang lưu video sang R2 42%. Bạn vẫn có thể xem lại ngay.
```

## Nguyen tac an toan

- KHONG xoa Cloudflare Stream video neu R2 chua verify.
- Chi xoa dung Cloudflare Stream UID cua replay do.
- Chi chuyen post sang `playback_provider='r2'` sau khi co `r2_video_url` playable.
- Khong danh `unrecoverable` chi vi MP4/multipart cham; chi coi la vinh vien khi Cloudflare UID that su 404/error ro rang.

## File Da Them/Sua

- `supabase/functions/_shared/archiveReplayService.ts`
- `supabase/functions/_shared/r2MultipartService.ts`
- `supabase/functions/_shared/replayFeedService.ts`
- `supabase/functions/admin-replay-debug/index.ts`
- `supabase/functions/live-replay-archive-cron/index.ts`
- `src/components/feed/PostMedia.tsx`
- `src/pages/AdminReplayDebug.tsx`
- `supabase/migrations/20260518100000_long_rtmp_replay_archive_repair.sql`

## Deploy / Runbook

1. Deploy cac Edge Functions lien quan:

```bash
supabase functions deploy live-replay-archive-cron
supabase functions deploy live-replay-mp4-poll-cron
supabase functions deploy admin-replay-debug
```

2. Apply migration:

```bash
supabase db push
```

3. Vao `/admin/replay-debug`:

- Bam `Preview long video` de xem replay RTMP dai/ket.
- Bam `Repair long video` de reset retry/lease va kick archive.
- Voi post cu the, dung action `diagnose_replay_archive` bang `post_id` hoac post URL.

> Luu y quan trong cho Lovable: migration cron SQL co body `net.http_post` chua Supabase project URL va anon key theo project hien tai. Truoc khi apply production, hay kiem tra lai `url` va `Authorization Bearer` dung voi Supabase project cua Fun Profile.

## Test Plan

- `cmd /c npx tsc --noEmit` pass.
- `git diff --check` pass.
- Tao RTMP replay dai hon 2 gio: archive tien tu `mp4_wait` -> `multipart_upload` -> `verifying` -> `posting` -> `done`.
- Replay cu dang ket: diagnose bang post URL, repair, thay progress tang dan va post cuoi cung chuyen sang R2.
- Sau R2 OK: Cloudflare Stream UID tuong ung moi bi xoa.
- Neu R2 chua verify: Cloudflare Stream video phai con nguyen.

---

# Full Source Code


---

## supabase/functions/_shared/archiveReplayService.ts

````ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { deleteStreamVideo, getStreamPlaybackUrls, requestMp4Download } from './cloudflareStreamService.ts';
import { deleteR2Object, deleteR2Prefix, headR2Object, uploadMp4ToR2, verifyR2PlayableUrl } from './r2StorageService.ts';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  fetchRangeStreamFromUrl,
  headContentLength,
  uploadPart,
  type UploadedPart,
} from './r2MultipartService.ts';
import {
  createOrUpdateInstantReplayPost,
  createOrUpdateReplayPost,
  updateReplayPostArchiveProgress,
  upsertCreatorLibrary,
} from './replayFeedService.ts';

// ============ STATE-MACHINE PHASES (resumable) ============
// Má»—i cron tick chá»‰ cháº¡y 1 phase + 1 Ä‘Æ¡n vá»‹ cÃ´ng viá»‡c nhá» â†’ < 30s wall-time.
const Phase = {
  MP4_EXPORT: 'mp4_export',         // gá»i POST /downloads (1 láº§n idempotent)
  MP4_WAIT: 'mp4_wait',             // Ä‘á»£i CF transcode (poll cron riÃªng)
  MULTIPART_INIT: 'multipart_init', // HEAD MP4 + CreateMultipartUpload R2
  MULTIPART_UPLOAD: 'multipart_upload', // upload tá»«ng part 1
  VERIFYING: 'verifying',           // CompleteMultipart + verify R2
  POSTING: 'posting',               // switch post sang R2
  DELETING_STREAM: 'deleting_stream', // xoÃ¡ CF Stream UID
  DONE: 'done',
} as const;

const PART_SIZE = 32 * 1024 * 1024; // 32 MB keeps long RTMP replay archive inside Edge time/memory limits.
const SINGLE_PUT_THRESHOLD = 100 * 1024 * 1024; // < 100MB dÃ¹ng single PUT cÅ©
const LEASE_MINUTES = 4;
const MULTIPART_MAX_PARTS_PER_TICK = 2;
const MULTIPART_TICK_BUDGET_MS = 25_000;
const STUCK_LARGE_MULTIPART_MS = 30 * 60 * 1000;

const ArchiveStep = {
  PROCESSING_STREAM: 'processing_stream',
  STREAM_READY: 'stream_ready',
  EXPORTING_MP4: 'exporting_mp4',
  ARCHIVING_R2: 'archiving_r2',
  UPLOADING_R2: 'uploading_r2',
  VERIFYING_R2: 'verifying_r2',
  R2_READY: 'r2_ready',
  ARCHIVED: 'archived',
  REPLAY_POSTED: 'replay_posted',
  STREAM_DELETE_PENDING: 'stream_delete_pending',
  STREAM_DELETED: 'stream_deleted',
  FAILED: 'failed',
} as const;

function nextRetryIso(attempts: number): string {
  const seconds = Math.min(3600, Math.max(30, 30 * (2 ** Math.min(attempts, 7))));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Dá»n webm nguá»“n + chunks trÃªn R2 sau khi MP4 Ä‘Ã£ archive thÃ nh cÃ´ng.
 * - CHá»ˆ cháº¡y khi: r2_video_url HEAD ok + replay_post_id tá»“n táº¡i + archive_status='archived'.
 * - Idempotent: náº¿u cá» webm_source_deleted_at / chunks_deleted_at Ä‘Ã£ set â†’ bá» qua.
 * - KHÃ”NG nÃ©m lá»—i: cleanup lÃ  bonus, fail khÃ´ng áº£nh hÆ°á»Ÿng archive.
 */
export async function cleanupR2Source(admin: SupabaseClient, replay: any): Promise<void> {
  try {
    const sourceKey: string | null = replay.source_webm_key || null;
    const recordingId: string | null = replay.chunked_recording_id || null;
    const patch: Record<string, unknown> = {};

    if (sourceKey && !replay.webm_source_deleted_at) {
      try {
        await deleteR2Object(sourceKey);
        patch.webm_source_deleted_at = new Date().toISOString();
        console.log('[CLEANUP_R2] deleted source webm', { replay_id: replay.id, key: sourceKey });
      } catch (err) {
        console.warn('[CLEANUP_R2] delete source webm failed (ignored)', { replay_id: replay.id, key: sourceKey, err: String(err) });
      }
    }

    if (recordingId && !replay.chunks_deleted_at) {
      const prefix = `recordings/${recordingId}/`;
      try {
        const result = await deleteR2Prefix(prefix);
        patch.chunks_deleted_at = new Date().toISOString();
        console.log('[CLEANUP_R2] deleted chunks prefix', { replay_id: replay.id, prefix, ...result });
      } catch (err) {
        console.warn('[CLEANUP_R2] delete chunks prefix failed (ignored)', { replay_id: replay.id, prefix, err: String(err) });
      }
    }

    if (Object.keys(patch).length > 0) {
      await (admin as any).from('live_replays').update(patch).eq('id', replay.id);
    }
  } catch (err) {
    console.warn('[CLEANUP_R2] outer error (ignored)', { replay_id: replay.id, err: String(err) });
  }
}

async function finalizeArchived(
  admin: SupabaseClient,
  replay: any,
  r2Url: string,
): Promise<{ post_id: string | null }> {
  const now = new Date().toISOString();
  // Always swap post to R2 (idempotent UPDATE by postId). Hybrid RTMP flow creates an
  // instant temp post at end-live with playback_provider='cloudflare_temp'; without
  // re-running the swap here, the post would forever point at a Cloudflare Stream URL
  // that gets deleted right after by deleteCloudflareStreamAfterArchive.
  const swappedPostId = await createOrUpdateReplayPost(admin, replay, r2Url);
  let postId: string | null = swappedPostId || replay.replay_post_id || null;
  if (swappedPostId) {
    await upsertCreatorLibrary(admin, { ...replay, title: replay.title }, swappedPostId);
    await (admin as any).from('live_replays').update({
      replay_post_id: swappedPostId,
      auto_posted_at: replay.auto_posted_at || now,
      posted_at: replay.posted_at || now,
    }).eq('id', replay.id);
  }
  await admin.from('live_sessions').update({
    status: postId ? ArchiveStep.REPLAY_POSTED : ArchiveStep.PROCESSING_STREAM,
    recording_status: 'ready',
    recording_ready_at: now,
    recording_error: null,
    archive_status: postId ? ArchiveStep.REPLAY_POSTED : ArchiveStep.FAILED,
    archive_error: postId ? null : 'Replay post not created',
    archived_at: postId ? (replay.archived_at || now) : null,
    r2_archived_at: postId ? (replay.archived_at || now) : null,
    replay_ready_at: postId ? now : null,
    posted_at: postId ? now : null,
    replay_post_id: postId,
    storage_provider: postId ? 'r2' : (replay.storage_provider || 'cloudflare_stream'),
    playback_provider: postId ? 'r2' : (replay.playback_provider || 'cloudflare_stream'),
    r2_object_key: replay.r2_object_key || null,
    r2_bucket: replay.r2_bucket || null,
    r2_video_url: r2Url,
    playback_url: r2Url,
    cloudflare_video_uid: replay.stream_uid || replay.cloudflare_video_uid || null,
    cloudflare_mp4_download_url: replay.cloudflare_mp4_download_url || null,
  }).eq('id', replay.live_session_id);
  return { post_id: postId };
}

async function markArchiveStep(admin: SupabaseClient, replay: any, step: string, patch: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  await (admin as any).from('live_replays').update({
    archive_status: step,
    archive_error: null,
    updated_at: now,
    ...patch,
  }).eq('id', replay.id);
  await admin.from('live_sessions').update({
    status: step,
    archive_status: step,
    archive_error: null,
    updated_at: now,
    ...patch,
  }).eq('id', replay.live_session_id);
  console.log('[RTMP_REPLAY_ARCHIVE_STEP]', {
    replay_id: replay.id,
    live_session_id: replay.live_session_id,
    step,
  });
}

export async function deleteCloudflareStreamAfterArchive(admin: SupabaseClient, replay: any, uid: string): Promise<void> {
  if (!uid || (replay.stream_deleted_at && replay.cloudflare_deleted_at)) return;

  // ÄÃ¡nh dáº¥u pending TRÆ¯á»šC khi gá»i DELETE Ä‘á»ƒ watchdog tháº¥y Ä‘Æ°á»£c náº¿u fail giá»¯a chá»«ng.
  try {
    await (admin as any).from('live_replays').update({
      archive_status: ArchiveStep.STREAM_DELETE_PENDING,
    }).eq('id', replay.id).eq('archive_status', ArchiveStep.R2_READY);
    await admin.from('live_sessions').update({
      status: ArchiveStep.STREAM_DELETE_PENDING,
      archive_status: ArchiveStep.STREAM_DELETE_PENDING,
    }).eq('id', replay.live_session_id).in('status', [ArchiveStep.R2_READY, ArchiveStep.ARCHIVED, ArchiveStep.REPLAY_POSTED]);
  } catch (_) { /* best-effort */ }

  try {
    const result = await deleteStreamVideo(uid);
    const deletedAt = new Date().toISOString();
    // Náº¿u replay Ä‘Ã£ cÃ³ post + R2 á»•n â†’ tiáº¿n tháº³ng terminal ARCHIVED Ä‘á»ƒ cleanup cron khÃ´ng pháº£i re-scan
    const hasPost = Boolean(replay.replay_post_id);
    const hasR2 = Boolean(replay.r2_video_url && replay.r2_object_key);
    const terminal = (hasPost && hasR2) ? ArchiveStep.ARCHIVED : ArchiveStep.STREAM_DELETED;
    await (admin as any).from('live_replays').update({
      stream_deleted_at: deletedAt,
      cloudflare_deleted_at: deletedAt,
      delete_stream_error: null,
      archive_status: terminal,
      archived_at: terminal === ArchiveStep.ARCHIVED ? (replay.archived_at || deletedAt) : replay.archived_at,
    }).eq('id', replay.id);
    await admin.from('live_sessions').update({
      status: terminal,
      archive_status: terminal,
      stream_deleted_at: deletedAt,
      cloudflare_deleted_at: deletedAt,
      delete_stream_error: null,
    }).eq('id', replay.live_session_id);
    console.log('[RTMP_REPLAY_STREAM_DELETED]', {
      replay_id: replay.id,
      live_session_id: replay.live_session_id,
      uid,
      terminal,
      result,
    });
    // Safety: delete only the exact UID that was verified for this replay.
    // Persistent RTMP keys reuse the same Live Input, so sweeping every video
    // on that input can delete another replay before its own R2 archive.
    const deleteExtraStreamVideos = replay.delete_extra_stream_videos === true;
    if (!deleteExtraStreamVideos) return;

    // XoÃ¡ thÃªm UID gá»‘c cá»§a live_sessions náº¿u khÃ¡c (Cloudflare táº¡o 2 video: 1 lÃºc Ä‘ang phÃ¡t + 1 tá»« /copy)
    try {
      const { data: sess } = await (admin as any)
        .from('live_sessions')
        .select('cloudflare_video_uid, cloudflare_live_input_id')
        .eq('id', replay.live_session_id)
        .maybeSingle();
      // Láº¥y thÃªm táº¥t cáº£ video CF táº¡o tá»« live input Ä‘á»ƒ xoÃ¡ háº¿t
      const inputId = sess?.cloudflare_live_input_id;
      const candidates = new Set<string>();
      if (sess?.cloudflare_video_uid && sess.cloudflare_video_uid !== uid) {
        candidates.add(String(sess.cloudflare_video_uid));
      }
      if (inputId) {
        try {
          const { listStreamLiveInputVideos } = await import('./cloudflareStreamService.ts');
          const videos = await listStreamLiveInputVideos(inputId).catch(() => []);
          for (const v of videos as any[]) {
            if (v?.uid && v.uid !== uid) candidates.add(String(v.uid));
          }
        } catch (_) { /* ignore */ }
      }
      for (const extraUid of candidates) {
        try {
          await deleteStreamVideo(extraUid);
          console.log('[RTMP_REPLAY_STREAM_DELETED_EXTRA]', { live_session_id: replay.live_session_id, uid: extraUid });
        } catch (e) {
          console.warn('[RTMP_REPLAY_STREAM_DELETE_EXTRA_FAILED]', { uid: extraUid, error: String(e) });
        }
      }
    } catch (e) {
      console.warn('[RTMP_REPLAY_EXTRA_CLEANUP_OUTER]', { error: String(e) });
    }
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
    .in('archive_status', ['archived', 'replay_posted', 'r2_ready', 'stream_delete_pending', 'stream_deleted'])
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

// ============================================================
// STATE-MACHINE DISPATCHER (resumable, multipart, lease-based)
// ============================================================

// Bypass PostgREST schema cache via RPCs (cache stale on new archive_* columns).
async function patchReplay(admin: SupabaseClient, replayId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await (admin as any).rpc('live_replays_patch', { p_id: replayId, p_patch: patch });
  if (error) console.warn('[PATCH_REPLAY_ERROR]', { replayId, error: error.message });
}

async function acquireLease(admin: SupabaseClient, replayId: string): Promise<boolean> {
  const { data, error } = await (admin as any).rpc('archive_acquire_lease', { p_id: replayId, p_minutes: LEASE_MINUTES });
  if (error) {
    console.warn('[ARCHIVE_LEASE_ERROR]', { replayId, error: error.message });
    return false;
  }
  return data === true;
}

async function releaseLease(admin: SupabaseClient, replayId: string): Promise<void> {
  await patchReplay(admin, replayId, { archive_lease_until: null });
}

async function setPhase(admin: SupabaseClient, replayId: string, phase: string, patch: Record<string, unknown> = {}) {
  await patchReplay(admin, replayId, { archive_phase: phase, ...patch });
}

async function recordTransientFailure(admin: SupabaseClient, replay: any, message: string, opts: { quickRetry?: boolean } = {}) {
  const attempts = Number(replay.archive_attempts || 0) + 1;
  const retryIso = opts.quickRetry
    ? new Date(Date.now() + 2 * 60 * 1000).toISOString()
    : nextRetryIso(attempts);
  await patchReplay(admin, replay.id, {
    archive_attempts: attempts,
    archive_error: message.slice(0, 1000),
    archive_next_retry_at: retryIso,
    last_error_at: new Date().toISOString(),
    error_message: message.slice(0, 1000),
    archive_lease_until: null,
  });
}

async function markUnrecoverable(admin: SupabaseClient, replay: any, reason: string, kind: 'mp4_stuck_zero' | 'stream_404') {
  const uid = replay.stream_uid || replay.cloudflare_video_uid;
  console.warn('[ARCHIVE_UNRECOVERABLE_KEEP_STREAM]', { replay_id: replay.id, uid, kind });
  // Náº¿u cÃ³ multipart Ä‘ang dá»Ÿ â†’ abort Ä‘á»ƒ giáº£i phÃ³ng R2 storage
  if (replay.multipart_upload_id && replay.r2_object_key) {
    try {
      await abortMultipartUpload(replay.r2_object_key, replay.multipart_upload_id);
    } catch (e) {
      console.warn('[ARCHIVE_UNRECOVERABLE] abortMultipart failed (ignored)', { replay_id: replay.id, err: String(e) });
    }
  }
  await patchReplay(admin, replay.id, {
    archive_status: 'unrecoverable',
    archive_phase: null,
    archive_error: reason.slice(0, 1000),
    archive_next_retry_at: null,
    archive_lease_until: null,
    last_error_at: new Date().toISOString(),
    error_message: reason.slice(0, 1000),
    multipart_upload_id: null,
  });
  // Notify user 1 láº§n
  try {
    const { data: existingNoti } = await (admin as any)
      .from('notifications')
      .select('id')
      .eq('user_id', replay.user_id)
      .eq('type', 'live_replay_failed')
      .eq('metadata->>replay_id', replay.id)
      .maybeSingle();
    if (!existingNoti) {
      await (admin as any).from('notifications').insert({
        user_id: replay.user_id,
        type: 'live_replay_failed',
        title: 'Báº£n ghi livestream khÃ´ng lÆ°u Ä‘Æ°á»£c',
        body: 'PhiÃªn livestream cá»§a báº¡n khÃ´ng thá»ƒ lÆ°u láº¡i do nguá»“n video bá»‹ giÃ¡n Ä‘oáº¡n. Láº§n sau hÃ£y Ä‘áº£m báº£o OBS cháº¡y Ä‘á»§ Ã­t nháº¥t 1 phÃºt trÆ°á»›c khi káº¿t thÃºc nhÃ©.',
        metadata: { replay_id: replay.id, live_session_id: replay.live_session_id, reason: kind },
      });
    }
  } catch (notiErr) {
    console.warn('[ARCHIVE_UNRECOVERABLE] notification failed (ignored)', { replay_id: replay.id, err: String(notiErr) });
  }
}

// ----- PHASE HANDLERS -----

async function runMp4Export(admin: SupabaseClient, replay: any): Promise<Record<string, unknown>> {
  const uid = replay.stream_uid || replay.cloudflare_video_uid;
  if (!uid) throw new Error('Missing Cloudflare Stream UID');
  const result = await requestMp4Download(uid);
  await setPhase(admin, replay.id, Phase.MP4_WAIT, {
    archive_status: ArchiveStep.EXPORTING_MP4,
    mp4_export_started_at: replay.mp4_export_started_at || new Date().toISOString(),
    cloudflare_mp4_download_url: result.url || replay.cloudflare_mp4_download_url || null,
    archive_lease_until: null,
  });
  await admin.from('live_sessions').update({
    status: ArchiveStep.EXPORTING_MP4,
    archive_status: ArchiveStep.EXPORTING_MP4,
  }).eq('id', replay.live_session_id).neq('status', 'live');
  return { ok: true, replay_id: replay.id, phase: Phase.MP4_WAIT, percentComplete: result.percentComplete };
}

async function runMultipartInit(admin: SupabaseClient, replay: any): Promise<Record<string, unknown>> {
  const uid = replay.stream_uid || replay.cloudflare_video_uid;
  if (!uid) throw new Error('Missing Cloudflare Stream UID');
  if (!replay.cloudflare_mp4_download_url) {
    // Láº¥y láº¡i URL náº¿u chÆ°a lÆ°u
    const status = await requestMp4Download(uid);
    if (!status.ready || !status.url) {
      throw new Error(`Cloudflare MP4 not ready (${status.percentComplete ?? 0}%)`);
    }
    replay.cloudflare_mp4_download_url = status.url;
  }
  const totalBytes = await headContentLength(replay.cloudflare_mp4_download_url);
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) throw new Error('Invalid MP4 content length');

  const objectKey = replay.r2_object_key || `live-replays/${replay.user_id}/${replay.live_session_id}/${uid}.mp4`;

  // ===== Fallback single PUT cho file < 100MB (Agora replay ngáº¯n) =====
  if (totalBytes < SINGLE_PUT_THRESHOLD) {
    console.log('[ARCHIVE_FAST_PATH] single PUT', { replay_id: replay.id, totalBytes });
    const videoResp = await fetch(replay.cloudflare_mp4_download_url);
    if (!videoResp.ok || !videoResp.body) throw new Error(`MP4 download failed: ${videoResp.status}`);
    await markArchiveStep(admin, replay, ArchiveStep.UPLOADING_R2);
    const uploaded = await uploadMp4ToR2(objectKey, videoResp.body, { contentLength: totalBytes });
    const playable = await verifyR2PlayableUrl(uploaded.url, 1024);
    if (!playable.ok) throw new Error(`R2 playable verification failed: ${playable.status}`);
    await patchReplay(admin, replay.id, {
      r2_object_key: uploaded.key,
      r2_bucket: uploaded.bucket,
      r2_video_url: uploaded.url,
      mp4_total_bytes: totalBytes,
      multipart_bytes_done: totalBytes,
      multipart_total_parts: 1,
      multipart_parts_done: [{ partNumber: 1, etag: 'single', size: totalBytes }],
      filesize_bytes: totalBytes,
      r2_verified_at: new Date().toISOString(),
      replay_ready_at: new Date().toISOString(),
      storage_provider: 'r2',
      playback_provider: 'r2',
      playback_mp4: uploaded.url,
      archive_status: ArchiveStep.ARCHIVED,
      archive_lease_until: null,
    });
    await setPhase(admin, replay.id, Phase.POSTING);
    return { ok: true, replay_id: replay.id, phase: Phase.POSTING, fast_path: true };
  }

  // ===== Multipart init =====
  const partSize = PART_SIZE;
  const totalParts = Math.ceil(totalBytes / partSize);
  if (totalParts > 10000) throw new Error(`Too many parts: ${totalParts} (max 10000)`);
  const init = await createMultipartUpload(objectKey);
  await setPhase(admin, replay.id, Phase.MULTIPART_UPLOAD, {
    archive_status: ArchiveStep.UPLOADING_R2,
    r2_object_key: init.key,
    r2_bucket: init.bucket,
    multipart_upload_id: init.uploadId,
    multipart_part_size: partSize,
    multipart_total_parts: totalParts,
    multipart_parts_done: replay.multipart_parts_done || [],
    multipart_bytes_done: 0,
    mp4_total_bytes: totalBytes,
    archive_lease_until: null,
  });
  await updateReplayPostArchiveProgress(admin, replay, {
    phase: Phase.MULTIPART_UPLOAD,
    bytesDone: 0,
    totalBytes,
    partsDone: 0,
    totalParts,
  });
  console.log('[ARCHIVE_MULTIPART_INIT]', { replay_id: replay.id, totalBytes, totalParts, partSize });
  return { ok: true, replay_id: replay.id, phase: Phase.MULTIPART_UPLOAD, totalBytes, totalParts };
}

async function runMultipartChunk(admin: SupabaseClient, replay: any): Promise<Record<string, unknown>> {
  if (!replay.multipart_upload_id || !replay.r2_object_key || !replay.cloudflare_mp4_download_url) {
    throw new Error('Multipart state missing (upload_id / object_key / mp4 url)');
  }
  const partSize = Number(replay.multipart_part_size || PART_SIZE);
  const totalBytes = Number(replay.mp4_total_bytes);
  const totalParts = Number(replay.multipart_total_parts);
  let partsDone: UploadedPart[] = Array.isArray(replay.multipart_parts_done) ? replay.multipart_parts_done : [];
  let bytesDone = Number(replay.multipart_bytes_done || 0);
  const tickStartedAt = Date.now();
  let uploadedThisTick = 0;
  const uploadedParts: number[] = [];

  while (uploadedThisTick < MULTIPART_MAX_PARTS_PER_TICK && Date.now() - tickStartedAt < MULTIPART_TICK_BUDGET_MS) {
    // TÃ¬m part Ä‘áº§u tiÃªn CHÆ¯A upload
    const doneNumbers = new Set(partsDone.map((p) => p.partNumber));
    let nextPartNumber = -1;
    for (let i = 1; i <= totalParts; i++) {
      if (!doneNumbers.has(i)) { nextPartNumber = i; break; }
    }
    if (nextPartNumber === -1) break;

    const startByte = (nextPartNumber - 1) * partSize;
    const endByteInclusive = Math.min(startByte + partSize - 1, totalBytes - 1);
    const expectedSize = endByteInclusive - startByte + 1;

    console.log('[ARCHIVE_MULTIPART_PART_START]', {
      replay_id: replay.id,
      partNumber: nextPartNumber,
      totalParts,
      bytes: `${startByte}-${endByteInclusive}`,
      expectedSize,
    });

    const chunkStream = await fetchRangeStreamFromUrl(replay.cloudflare_mp4_download_url, startByte, endByteInclusive);
    const uploaded = await uploadPart({
      key: replay.r2_object_key,
      uploadId: replay.multipart_upload_id,
      partNumber: nextPartNumber,
      body: chunkStream,
      contentLength: expectedSize,
    });

    partsDone = [...partsDone, uploaded].sort((a, b) => a.partNumber - b.partNumber);
    bytesDone += expectedSize;
    uploadedThisTick += 1;
    uploadedParts.push(nextPartNumber);

    const allDoneAfterPart = partsDone.length >= totalParts;
    await patchReplay(admin, replay.id, {
      multipart_parts_done: partsDone,
      multipart_bytes_done: bytesDone,
      archive_phase: allDoneAfterPart ? Phase.VERIFYING : Phase.MULTIPART_UPLOAD,
      archive_status: allDoneAfterPart ? ArchiveStep.VERIFYING_R2 : ArchiveStep.UPLOADING_R2,
      archive_error: null,
      error_message: null,
      archive_lease_until: null,
      updated_at: new Date().toISOString(),
    });
    await updateReplayPostArchiveProgress(admin, replay, {
      phase: allDoneAfterPart ? Phase.VERIFYING : Phase.MULTIPART_UPLOAD,
      bytesDone,
      totalBytes,
      partsDone: partsDone.length,
      totalParts,
    });

    console.log('[ARCHIVE_MULTIPART_PART_DONE]', {
      replay_id: replay.id,
      partNumber: nextPartNumber,
      totalParts,
      progress: `${Math.round((bytesDone / totalBytes) * 100)}%`,
    });

    if (allDoneAfterPart) break;
  }

  const allDone = partsDone.length >= totalParts;
  if (allDone) {
    // Táº¥t cáº£ parts Ä‘Ã£ xong â†’ chuyá»ƒn verify
    await setPhase(admin, replay.id, Phase.VERIFYING, { archive_lease_until: null });
    return {
      ok: true,
      replay_id: replay.id,
      phase: Phase.VERIFYING,
      uploaded_parts: uploadedParts,
      progress: 1,
    };
  }

  return {
    ok: true,
    replay_id: replay.id,
    phase: Phase.MULTIPART_UPLOAD,
    uploaded_parts: uploadedParts,
    parts_done: partsDone.length,
    totalParts,
    progress: bytesDone / totalBytes,
  };
}

async function runVerifying(admin: SupabaseClient, replay: any): Promise<Record<string, unknown>> {
  if (!replay.multipart_upload_id || !replay.r2_object_key) {
    // Fast-path Ä‘Ã£ single-PUT xong rá»“i â†’ bá» qua complete
    await setPhase(admin, replay.id, Phase.POSTING);
    return { ok: true, replay_id: replay.id, phase: Phase.POSTING, skipped_complete: true };
  }
  const parts: UploadedPart[] = Array.isArray(replay.multipart_parts_done) ? replay.multipart_parts_done : [];
  if (parts.length !== Number(replay.multipart_total_parts)) {
    throw new Error(`Cannot complete: ${parts.length}/${replay.multipart_total_parts} parts uploaded`);
  }
  const completed = await completeMultipartUpload({
    key: replay.r2_object_key,
    uploadId: replay.multipart_upload_id,
    parts,
  });
  // HEAD + Range verify
  const head = await headR2Object(completed.key);
  if (!head.exists || head.size <= 0) throw new Error('R2 HEAD verification failed after complete');
  const playable = await verifyR2PlayableUrl(completed.url, 1024);
  if (!playable.ok) throw new Error(`R2 playable verification failed: ${playable.status}`);

  const now = new Date().toISOString();
  await patchReplay(admin, replay.id, {
    archive_status: ArchiveStep.ARCHIVED,
    archive_phase: Phase.POSTING,
    archived_at: now,
    r2_verified_at: now,
    replay_ready_at: now,
    r2_video_url: completed.url,
    playback_mp4: completed.url,
    storage_provider: 'r2',
    playback_provider: 'r2',
    filesize_bytes: head.size,
    multipart_upload_id: null,
    expires_at: null,
    archive_lease_until: null,
  });
  console.log('[ARCHIVE_VERIFY_OK]', { replay_id: replay.id, size: head.size });
  return { ok: true, replay_id: replay.id, phase: Phase.POSTING, size: head.size };
}

async function runPosting(admin: SupabaseClient, replay: any): Promise<Record<string, unknown>> {
  // Re-fetch Ä‘á»ƒ cÃ³ URL R2 má»›i nháº¥t
  const { data: fresh } = await (admin as any).from('live_replays').select('*').eq('id', replay.id).maybeSingle();
  const r2Url = fresh?.r2_video_url || replay.r2_video_url;
  if (!r2Url) throw new Error('Missing r2_video_url at posting phase');
  const postId = await createOrUpdateReplayPost(admin, fresh || replay, r2Url);
  await upsertCreatorLibrary(admin, { ...(fresh || replay), title: (fresh || replay).title }, postId);
  const now = new Date().toISOString();
  await patchReplay(admin, replay.id, {
    replay_post_id: postId,
    auto_posted_at: now,
    posted_at: now,
    archive_status: ArchiveStep.R2_READY,
    archive_phase: Phase.DELETING_STREAM,
    archive_lease_until: null,
  });
  await admin.from('live_sessions').update({
    status: ArchiveStep.R2_READY,
    archive_status: ArchiveStep.R2_READY,
    storage_provider: 'r2',
    playback_provider: 'r2',
    r2_object_key: (fresh || replay).r2_object_key,
    r2_bucket: (fresh || replay).r2_bucket,
    r2_video_url: r2Url,
    playback_url: r2Url,
    posted_at: now,
    replay_ready_at: now,
    r2_archived_at: now,
    archived_at: now,
    replay_post_id: postId,
  }).eq('id', replay.live_session_id);
  return { ok: true, replay_id: replay.id, phase: Phase.DELETING_STREAM, post_id: postId };
}

async function runDeletingStream(admin: SupabaseClient, replay: any): Promise<Record<string, unknown>> {
  const uid = replay.stream_uid || replay.cloudflare_video_uid;
  if (uid) {
    await deleteCloudflareStreamAfterArchive(admin, { ...replay, archive_status: ArchiveStep.R2_READY }, uid);
  }
  await cleanupR2Source(admin, replay);
  await patchReplay(admin, replay.id, {
    archive_phase: Phase.DONE,
    archive_lease_until: null,
  });
  return { ok: true, replay_id: replay.id, phase: Phase.DONE };
}

async function maybeRestartStuckLargeMultipart(admin: SupabaseClient, replay: any): Promise<boolean> {
  const phase = String(replay.archive_phase || '');
  const oldPartSize = Number(replay.multipart_part_size || 0);
  if (phase !== Phase.MULTIPART_UPLOAD || !replay.multipart_upload_id || !replay.r2_object_key) return false;
  if (!oldPartSize || oldPartSize <= PART_SIZE) return false;
  if (replay.r2_video_url) return false;

  const updatedMs = replay.updated_at ? Date.parse(String(replay.updated_at)) : 0;
  const lastProgressMs = Number.isFinite(updatedMs) ? updatedMs : 0;
  const stale = lastProgressMs > 0 && Date.now() - lastProgressMs >= STUCK_LARGE_MULTIPART_MS;
  const repeatedFailures = Number(replay.archive_attempts || 0) >= 3;
  if (!stale && !repeatedFailures) return false;

  console.warn('[ARCHIVE_RESTART_LARGE_MULTIPART]', {
    replay_id: replay.id,
    uploadId: replay.multipart_upload_id,
    oldPartSize,
    newPartSize: PART_SIZE,
    stale,
    repeatedFailures,
  });

  try {
    await abortMultipartUpload(replay.r2_object_key, replay.multipart_upload_id);
  } catch (error) {
    console.warn('[ARCHIVE_RESTART_LARGE_MULTIPART] abort failed (ignored)', {
      replay_id: replay.id,
      err: error instanceof Error ? error.message : String(error),
    });
  }

  await patchReplay(admin, replay.id, {
    archive_phase: Phase.MULTIPART_INIT,
    archive_status: ArchiveStep.STREAM_READY,
    archive_attempts: 0,
    archive_error: null,
    error_message: null,
    last_error_at: null,
    archive_next_retry_at: new Date().toISOString(),
    archive_lease_until: null,
    multipart_upload_id: null,
    multipart_parts_done: [],
    multipart_bytes_done: 0,
    multipart_total_parts: null,
    multipart_part_size: null,
    last_cf_status: 'restart_large_multipart_32mb',
    last_cf_response: {
      previous_part_size: oldPartSize,
      previous_parts_done: Array.isArray(replay.multipart_parts_done) ? replay.multipart_parts_done.length : 0,
      restarted_at: new Date().toISOString(),
    },
  });
  return true;
}

// ----- DISPATCHER -----

export async function archiveReplay(admin: SupabaseClient, replayId: string): Promise<Record<string, unknown>> {
  const { data: replay, error } = await (admin as any)
    .from('live_replays')
    .select('*')
    .eq('id', replayId)
    .maybeSingle();
  if (error) throw error;
  if (!replay) throw new Error('Replay not found');

  // GUARD: never archive while the session is truly live.
  // Some RTMP sessions can retain status='live' after Cloudflare has already
  // materialized a ready VOD; ended_at is the source of truth for replay archival.
  const { data: liveSessionForGuard } = await (admin as any)
    .from('live_sessions')
    .select('status, ended_at')
    .eq('id', replay.live_session_id)
    .maybeSingle();
  if (liveSessionForGuard?.status === 'live' && !liveSessionForGuard?.ended_at) {
    return { ok: true, status: 'skipped_live_in_progress', replay_id: replay.id };
  }
  if (liveSessionForGuard?.status === 'live' && liveSessionForGuard?.ended_at && replay.status === 'ready') {
    await admin.from('live_sessions').update({
      status: 'replay_temp_ready',
      archive_status: replay.archive_status || 'pending',
      archive_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', replay.live_session_id);
  }

  if (
    replay.status === 'ready'
    && !replay.r2_video_url
    && (replay.cloudflare_playback_url || replay.playback_hls || replay.stream_uid || replay.cloudflare_video_uid)
  ) {
    const uid = replay.stream_uid || replay.cloudflare_video_uid;
    const tempUrl = replay.cloudflare_playback_url || replay.playback_hls || (uid ? getStreamPlaybackUrls(uid).hls : null);
    if (tempUrl) {
      const postId = await createOrUpdateInstantReplayPost(admin, replay, tempUrl);
      if (postId && !replay.replay_post_id) {
        const now = new Date().toISOString();
        await (admin as any).from('live_replays').update({
          replay_post_id: postId,
          auto_posted_at: replay.auto_posted_at || now,
          posted_at: replay.posted_at || now,
        }).eq('id', replay.id);
      }
    }
  }

  // SELF-HEAL: náº¿u R2 Ä‘Ã£ cÃ³ file Ä‘áº§y Ä‘á»§ â†’ finalize ngay (giá»¯ nguyÃªn path cÅ©)
  if (replay.r2_object_key && replay.r2_video_url) {
    const exists = await headR2Object(replay.r2_object_key).catch(() => ({ exists: false, size: 0 }));
    if (exists.exists && exists.size > 0) {
      const post = await finalizeArchived(admin, replay, replay.r2_video_url);
      const patch: Record<string, unknown> = {
        archive_status: ArchiveStep.REPLAY_POSTED,
        archive_phase: Phase.DONE,
        archive_error: null,
        archived_at: replay.archived_at || new Date().toISOString(),
        r2_verified_at: replay.r2_verified_at || new Date().toISOString(),
        replay_ready_at: replay.replay_ready_at || new Date().toISOString(),
        status: 'ready',
        playback_provider: 'r2',
        storage_provider: 'r2',
        playback_mp4: replay.playback_mp4 || replay.r2_video_url,
        expires_at: null,
        archive_lease_until: null,
      };
      await patchReplay(admin, replay.id, patch);
      if (replay.stream_uid) {
        await deleteCloudflareStreamAfterArchive(admin, { ...replay, ...patch }, replay.stream_uid);
      }
      await cleanupR2Source(admin, { ...replay, ...patch });
      return { ok: true, status: 'self_healed', replay_id: replay.id, post_id: post.post_id };
    }
  }

  // ===== Lease guard =====
  const got = await acquireLease(admin, replay.id);
  if (!got) {
    return { ok: true, status: 'skipped_lease_held', replay_id: replay.id };
  }

  // Re-fetch sau lease Ä‘á»ƒ cÃ³ state má»›i nháº¥t
  const { data: fresh } = await (admin as any).from('live_replays').select('*').eq('id', replay.id).maybeSingle();
  let current = fresh || replay;

  if (await maybeRestartStuckLargeMultipart(admin, current)) {
    const { data: restarted } = await (admin as any).from('live_replays').select('*').eq('id', replay.id).maybeSingle();
    current = restarted || { ...current, archive_phase: Phase.MULTIPART_INIT };
  }

  // Khá»Ÿi táº¡o phase náº¿u chÆ°a cÃ³
  let phase: string = current.archive_phase || Phase.MP4_EXPORT;
  if (!current.archive_phase) {
    await setPhase(admin, current.id, Phase.MP4_EXPORT, {
      archive_attempts: Number(current.archive_attempts || 0) + 1,
    });
    phase = Phase.MP4_EXPORT;
  }

  try {
    let result: Record<string, unknown> = { ok: true, replay_id: current.id, phase };
    switch (phase) {
      case Phase.MP4_EXPORT:
        result = await runMp4Export(admin, current);
        break;
      case Phase.MP4_WAIT:
        // Cron MP4 riÃªng váº«n cháº¡y, nhÆ°ng archive cron cÅ©ng poll trá»±c tiáº¿p Ä‘á»ƒ self-heal
        // cÃ¡c replay dÃ i bá»‹ miss job hoáº·c bá»‹ káº¹t á»Ÿ mp4_wait.
        await releaseLease(admin, current.id);
        result = await pollMp4ForReplay(admin, current.id);
        break;
      case Phase.MULTIPART_INIT:
        result = await runMultipartInit(admin, current);
        break;
      case Phase.MULTIPART_UPLOAD:
        result = await runMultipartChunk(admin, current);
        break;
      case Phase.VERIFYING:
        result = await runVerifying(admin, current);
        break;
      case Phase.POSTING:
        result = await runPosting(admin, current);
        break;
      case Phase.DELETING_STREAM:
        result = await runDeletingStream(admin, current);
        break;
      case Phase.DONE:
        await releaseLease(admin, current.id);
        result = { ok: true, replay_id: current.id, phase: Phase.DONE, status: 'already_done' };
        break;
      default:
        await releaseLease(admin, current.id);
        result = { ok: true, replay_id: current.id, phase, status: 'unknown_phase_skipped' };
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const anyErr = err as { httpStatus?: number; notFound?: boolean };
    const isPermanent404 = anyErr?.notFound === true || anyErr?.httpStatus === 404
      || /404|not.?found/i.test(message);

    // Race-check: náº¿u invocation song song Ä‘Ã£ hoÃ n táº¥t â†’ bá» qua
    const { data: latest } = await (admin as any)
      .from('live_replays')
      .select('r2_video_url, replay_post_id, archive_status, archive_phase')
      .eq('id', current.id)
      .maybeSingle();
    if (latest?.r2_video_url && latest?.replay_post_id) {
      await patchReplay(admin, current.id, {
        archive_status: 'archived',
        archive_error: null,
        archive_lease_until: null,
        archived_at: new Date().toISOString(),
        last_error_at: new Date().toISOString(),
        error_message: `(ignored late error after archived) ${message}`.slice(0, 1000),
      });
      return { ok: true, status: 'archived_race_ignored', replay_id: current.id };
    }

    const attempts = Number(current.archive_attempts || 0);
    const isPermanent404Unrecoverable = isPermanent404 && attempts >= 3 && !latest?.r2_video_url;
    if (isPermanent404Unrecoverable) {
      const reason = `Stream UID khÃ´ng cÃ²n trÃªn Cloudflare (404). KhÃ´ng thá»ƒ export MP4.`;
      await markUnrecoverable(admin, current, reason, 'stream_404');
      return { ok: false, status: 'unrecoverable', replay_id: current.id, error: message };
    }

    const mp4Pending = /MP4 not ready/i.test(message);
    await recordTransientFailure(admin, current, message, { quickRetry: mp4Pending });
    // GIá»® archive_phase Ä‘á»ƒ cron tick sau retry Ä‘Ãºng phase. KHÃ”NG flip session sang failed náº¿u Ä‘ang live.
    console.warn('[ARCHIVE_PHASE_FAILED]', { replay_id: current.id, phase, error: message });
    throw err;
  } finally {
    // Best-effort release náº¿u chÆ°a release (RPC bypass schema cache)
    await patchReplay(admin, replayId, { archive_lease_until: null });
  }
}

// ============================================================
// MP4 POLLING (cháº¡y bá»Ÿi cron riÃªng â€” KHÃ”NG block archive cron)
// ============================================================

export async function pollMp4ForReplay(admin: SupabaseClient, replayId: string): Promise<Record<string, unknown>> {
  const { data: replay } = await (admin as any).from('live_replays').select('*').eq('id', replayId).maybeSingle();
  if (!replay) return { ok: false, status: 'not_found' };
  if (replay.archive_phase !== Phase.MP4_WAIT) {
    return { ok: true, status: 'skipped_wrong_phase', phase: replay.archive_phase };
  }
  const uid = replay.stream_uid || replay.cloudflare_video_uid;
  if (!uid) return { ok: false, status: 'no_uid' };

  try {
    const result = await requestMp4Download(uid);
    if (result.ready && result.url) {
      await (admin as any).from('live_replays').update({
        mp4_ready_at: new Date().toISOString(),
        cloudflare_mp4_download_url: result.url,
        archive_phase: Phase.MULTIPART_INIT,
        archive_status: ArchiveStep.STREAM_READY,
        updated_at: new Date().toISOString(),
      }).eq('id', replayId);
      await admin.from('live_sessions').update({
        status: ArchiveStep.STREAM_READY,
        archive_status: ArchiveStep.STREAM_READY,
        cloudflare_mp4_download_url: result.url,
        updated_at: new Date().toISOString(),
      }).eq('id', replay.live_session_id).neq('status', 'live');
      console.log('[MP4_POLL_READY]', { replay_id: replayId, url: result.url });
      return { ok: true, status: 'ready', replay_id: replayId };
    }
    return { ok: true, status: 'pending', percentComplete: result.percentComplete };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const anyErr = err as { httpStatus?: number; notFound?: boolean };
    const isPermanent404 = anyErr?.notFound === true || anyErr?.httpStatus === 404;
    if (isPermanent404) {
      const attempts = Number(replay.archive_attempts || 0) + 1;
      await (admin as any).from('live_replays').update({ archive_attempts: attempts }).eq('id', replayId);
      if (attempts >= 3) {
        await markUnrecoverable(admin, { ...replay, archive_attempts: attempts }, `Stream UID 404: ${message}`, 'stream_404');
        return { ok: false, status: 'unrecoverable_404', replay_id: replayId };
      }
    }
    return { ok: false, status: 'poll_failed', error: message };
  }
}

````

---

## supabase/functions/_shared/r2MultipartService.ts

````ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * R2 multipart upload helpers (S3-compatible).
 * DÃ¹ng cho server-side archive: stream tá»«ng part tá»« Cloudflare Stream MP4 â†’ R2.
 * Resumable: lÆ°u uploadId + parts_done trong DB; má»—i cron tick chá»‰ upload 1 part.
 *
 * Tá»± kÃ½ SigV4 ngay trong file nÃ y (KHÃ”NG depend `aws4fetch` / SDK) Ä‘á»ƒ giá»¯ edge function nháº¹.
 */

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
  host: string;
}

function getR2Config(): R2Config {
  const accountId = Deno.env.get('R2_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') || Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') || Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY');
  const bucketName = Deno.env.get('R2_BUCKET_NAME') || Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME');
  const publicUrl = Deno.env.get('R2_PUBLIC_DOMAIN') || Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    throw new Error('Missing Cloudflare R2 config');
  }
  const endpoint = Deno.env.get('R2_ENDPOINT');
  const endpointHost = endpoint ? new URL(endpoint).host : null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl: publicUrl.replace(/\/$/, ''),
    host: endpointHost || `${accountId}.r2.cloudflarestorage.com`,
  };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function getSignatureKey(key: string, dateStamp: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${key}`).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, 'auto');
  const kService = await hmacSha256(kRegion, 's3');
  return hmacSha256(kService, 'aws4_request');
}

/**
 * SigV4 cho request cÃ³ query string + body (UNSIGNED-PAYLOAD ok vá»›i R2).
 */
async function signedR2Request(opts: {
  method: string;
  key: string; // object key trong bucket; rá»—ng = bucket-level (vd: list multipart)
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: BodyInit;
}): Promise<Response> {
  const r2 = getR2Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalUri = opts.key
    ? `/${r2.bucketName}/${opts.key.split('/').map(encodeURIComponent).join('/')}`
    : `/${r2.bucketName}`;

  const queryParams = opts.query || {};
  const sortedQueryKeys = Object.keys(queryParams).sort();
  const canonicalQuery = sortedQueryKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const allHeaders: Record<string, string> = {
    ...Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v])),
    host: r2.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sorted = Object.keys(allHeaders).sort();
  const signedHeaders = sorted.join(';');
  const canonicalHeaders = sorted.map((k) => `${k}:${allHeaders[k]}`).join('\n') + '\n';

  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const requestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, requestHash].join('\n');
  const signature = toHex(await hmacSha256(await getSignatureKey(r2.secretAccessKey, dateStamp), stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${r2.host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
  return fetch(url, {
    method: opts.method,
    headers: { ...allHeaders, Authorization: authorization },
    body: opts.body,
  });
}

export interface MultipartInitResult {
  uploadId: string;
  key: string;
  bucket: string;
}

/**
 * CreateMultipartUpload: tráº£ vá» uploadId Ä‘á»ƒ dÃ¹ng cho má»—i part.
 */
export async function createMultipartUpload(key: string, contentType = 'video/mp4'): Promise<MultipartInitResult> {
  const r2 = getR2Config();
  const resp = await signedR2Request({
    method: 'POST',
    key,
    query: { uploads: '' },
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`R2 createMultipartUpload failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  const xml = await resp.text();
  const m = xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!m) throw new Error(`R2 createMultipartUpload: no UploadId in response. Body=${xml.slice(0, 200)}`);
  return { uploadId: m[1], key, bucket: r2.bucketName };
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
  size: number;
}

/**
 * UploadPart: PUT 1 part vÃ o uploadId. Tráº£ ETag Ä‘á»ƒ Complete sau.
 * Body cÃ³ thá»ƒ lÃ  Uint8Array hoáº·c ReadableStream â€” content-length Báº®T BUá»˜C Ä‘á»ƒ R2 cháº¥p nháº­n.
 */
export async function uploadPart(opts: {
  key: string;
  uploadId: string;
  partNumber: number;
  body: Uint8Array | ReadableStream<Uint8Array>;
  contentLength: number;
}): Promise<UploadedPart> {
  if (opts.partNumber < 1 || opts.partNumber > 10000) {
    throw new Error(`Invalid partNumber ${opts.partNumber} (must be 1..10000)`);
  }
  const resp = await signedR2Request({
    method: 'PUT',
    key: opts.key,
    query: { partNumber: String(opts.partNumber), uploadId: opts.uploadId },
    headers: { 'content-length': String(opts.contentLength) },
    body: opts.body as BodyInit,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`R2 uploadPart ${opts.partNumber} failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  // Drain body to free socket
  try { await resp.arrayBuffer(); } catch { /* ignore */ }
  const etag = (resp.headers.get('etag') || '').replace(/"/g, '');
  if (!etag) throw new Error(`R2 uploadPart ${opts.partNumber}: missing ETag header`);
  return { partNumber: opts.partNumber, etag, size: opts.contentLength };
}

/**
 * CompleteMultipartUpload: gá»­i danh sÃ¡ch parts theo thá»© tá»±. R2 sáº½ ghÃ©p thÃ nh object cuá»‘i.
 */
export async function completeMultipartUpload(opts: {
  key: string;
  uploadId: string;
  parts: UploadedPart[];
}): Promise<{ url: string; key: string; bucket: string }> {
  const r2 = getR2Config();
  const sorted = [...opts.parts].sort((a, b) => a.partNumber - b.partNumber);
  const xmlBody =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
    sorted.map((p) =>
      `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`
    ).join('') +
    `</CompleteMultipartUpload>`;
  const resp = await signedR2Request({
    method: 'POST',
    key: opts.key,
    query: { uploadId: opts.uploadId },
    headers: { 'content-type': 'application/xml' },
    body: xmlBody,
  });
  const text = await resp.text().catch(() => '');
  if (!resp.ok) {
    throw new Error(`R2 completeMultipartUpload failed: ${resp.status} ${text.slice(0, 300)}`);
  }
  // R2 tráº£ 200 nhÆ°ng cÃ³ thá»ƒ chá»©a <Error>...</Error> â€” check
  if (/<Error>/i.test(text)) {
    throw new Error(`R2 completeMultipartUpload returned error body: ${text.slice(0, 300)}`);
  }
  return { url: `${r2.publicUrl}/${opts.key}`, key: opts.key, bucket: r2.bucketName };
}

/**
 * AbortMultipartUpload: xoÃ¡ uploadId + táº¥t cáº£ parts Ä‘Ã£ upload (giáº£i phÃ³ng quota).
 */
export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  const resp = await signedR2Request({
    method: 'DELETE',
    key,
    query: { uploadId },
  });
  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text().catch(() => '');
    console.warn('[R2_ABORT_MULTIPART_FAILED]', { key, uploadId, status: resp.status, body: text.slice(0, 200) });
  }
}

/**
 * Stream-fetch 1 chunk tá»« Cloudflare MP4 URL báº±ng Range header.
 * Tráº£ stream Ä‘á»ƒ archive video dÃ i khÃ´ng pháº£i giá»¯ nguyÃªn part lá»›n trong memory.
 */
export async function fetchRangeStreamFromUrl(
  url: string,
  startByte: number,
  endByteInclusive: number,
): Promise<ReadableStream<Uint8Array>> {
  const resp = await fetch(url, {
    headers: { Range: `bytes=${startByte}-${endByteInclusive}` },
  });
  if (resp.status !== 206 || !resp.body) {
    const err = new Error(`Range stream fetch failed: ${resp.status}`) as Error & { httpStatus?: number; notFound?: boolean };
    err.httpStatus = resp.status;
    err.notFound = resp.status === 404;
    throw err;
  }
  return resp.body;
}

/**
 * Stream-fetch 1 chunk tá»« Cloudflare MP4 URL báº±ng Range header.
 * Tráº£ Uint8Array cho cÃ¡c lá»‘i cÅ©/cáº§n kiá»ƒm tra byte length.
 */
export async function fetchRangeFromUrl(url: string, startByte: number, endByteInclusive: number): Promise<Uint8Array> {
  const resp = await fetch(url, {
    headers: { Range: `bytes=${startByte}-${endByteInclusive}` },
  });
  if (resp.status !== 206 && resp.status !== 200) {
    const err = new Error(`Range fetch failed: ${resp.status}`) as Error & { httpStatus?: number; notFound?: boolean };
    err.httpStatus = resp.status;
    err.notFound = resp.status === 404;
    throw err;
  }
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * HEAD url Ä‘á»ƒ láº¥y content-length (Cloudflare MP4) â€” KHÃ”NG cáº§n SigV4 (URL public).
 */
export async function headContentLength(url: string): Promise<number> {
  // Má»™t sá»‘ CDN/origin tráº£ 405 vá»›i HEAD â†’ fallback Range 0-0 láº¥y content-range total
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (head && head.ok) {
    const len = Number(head.headers.get('content-length') || 0);
    if (Number.isFinite(len) && len > 0) return len;
  }
  const r = await fetch(url, { headers: { Range: 'bytes=0-0' } });
  if (r.status === 206) {
    const cr = r.headers.get('content-range') || '';
    const m = cr.match(/\/(\d+)$/);
    try { await r.arrayBuffer(); } catch { /* drain */ }
    if (m) return Number(m[1]);
  }
  try { await r.arrayBuffer(); } catch { /* drain */ }
  throw new Error(`headContentLength: cannot determine content-length (status=${r.status})`);
}

````

---

## supabase/functions/_shared/replayFeedService.ts

````ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const OPTIMIZING_MESSAGE = 'Äang tá»‘i Æ°u video replay trong ná»n. Báº¡n váº«n cÃ³ thá»ƒ xem láº¡i ngay.';

function progressMessage(percent: number | null): string {
  if (typeof percent === 'number' && Number.isFinite(percent) && percent > 0) {
    return `Äang lÆ°u video sang R2 ${Math.min(99, Math.max(1, Math.round(percent)))}%. Báº¡n váº«n cÃ³ thá»ƒ xem láº¡i ngay.`;
  }
  return OPTIMIZING_MESSAGE;
}

export async function updateReplayPostArchiveProgress(
  admin: SupabaseClient,
  replay: Record<string, any>,
  progress: {
    phase?: string | null;
    bytesDone?: number | null;
    totalBytes?: number | null;
    partsDone?: number | null;
    totalParts?: number | null;
  },
): Promise<void> {
  const totalBytes = Number(progress.totalBytes || 0);
  const bytesDone = Number(progress.bytesDone || 0);
  const percent = totalBytes > 0 ? Math.round((bytesDone / totalBytes) * 100) : null;
  const message = progressMessage(percent);
  let postId = replay.replay_post_id || null;
  if (!postId && replay.live_session_id) {
    const { data: liveSession } = await admin
      .from('live_sessions')
      .select('post_id, live_post_id')
      .eq('id', replay.live_session_id)
      .maybeSingle();
    postId = liveSession?.post_id || (liveSession as any)?.live_post_id || null;
  }
  if (!postId) return;

  const { data: post } = await admin
    .from('posts')
    .select('metadata')
    .eq('id', postId)
    .maybeSingle();
  const metadata = {
    ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
    archive_status: progress.phase === 'verifying' ? 'verifying_r2' : 'uploading_r2',
    archive_phase: progress.phase || null,
    archive_progress_percent: percent,
    multipart_bytes_done: bytesDone || null,
    mp4_total_bytes: totalBytes || null,
    multipart_parts_done: progress.partsDone || null,
    multipart_total_parts: progress.totalParts || null,
    processing_message: message,
  };
  const { error } = await admin.from('posts').update({
    processing_message: message,
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', postId);
  if (error) console.warn('[REPLAY_POST_PROGRESS_UPDATE_FAILED]', { postId, error: error.message });
}

export async function createOrUpdateInstantReplayPost(
  admin: SupabaseClient,
  replay: Record<string, any>,
  cloudflareUrl: string,
): Promise<string | null> {
  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('id, post_id, live_post_id, title, description, ended_at, privacy, host_user_id, owner_id, mode')
    .eq('id', replay.live_session_id)
    .maybeSingle();
  const postId = liveSession?.post_id || (liveSession as any)?.live_post_id || null;
  if (!postId || !cloudflareUrl) return null;

  const { data: post } = await admin
    .from('posts')
    .select('metadata, content')
    .eq('id', postId)
    .maybeSingle();

  const now = new Date().toISOString();
  const metadata = {
    ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
    live_title: liveSession.title,
    live_description: (liveSession as any).description || '',
    live_status: 'ended',
    live_mode: (liveSession as any).mode || 'rtmp_obs',
    live_session_id: replay.live_session_id,
    replay_id: replay.id,
    replay_badge: 'REPLAY',
    badge: 'REPLAY',
    post_type: 'live_replay',
    playback_url: cloudflareUrl,
    playback_hls: cloudflareUrl,
    playback_type: 'cloudflare_temp',
    playback_provider: 'cloudflare_temp',
    storage_provider: 'cloudflare_stream',
    archive_status: replay.archive_status || 'pending',
    archive_phase: replay.archive_phase || null,
    archive_progress_percent: replay.mp4_total_bytes
      ? Math.round((Number(replay.multipart_bytes_done || 0) / Number(replay.mp4_total_bytes || 1)) * 100)
      : null,
    multipart_bytes_done: replay.multipart_bytes_done || null,
    mp4_total_bytes: replay.mp4_total_bytes || null,
    multipart_total_parts: replay.multipart_total_parts || null,
    replay_status: 'ready',
    replay_ready: true,
    replay_source: 'cloudflare_temp',
    processing_message: progressMessage(replay.mp4_total_bytes
      ? (Number(replay.multipart_bytes_done || 0) / Number(replay.mp4_total_bytes || 1)) * 100
      : null),
    cloudflare_playback_url: cloudflareUrl,
    stream_uid: replay.stream_uid || replay.cloudflare_video_uid,
    cloudflare_video_uid: replay.stream_uid || replay.cloudflare_video_uid,
    thumbnail_url: replay.thumbnail_url,
    ended_at: liveSession.ended_at || now,
    posted_at: replay.posted_at || replay.auto_posted_at || now,
  };

  const { error: updErr } = await admin.from('posts').update({
    video_url: cloudflareUrl,
    image_url: null,
    post_type: 'live_replay',
    replay_status: 'ready',
    playback_provider: 'cloudflare_temp',
    thumbnail_url: replay.thumbnail_url || null,
    replay_ready: true,
    processing_message: metadata.processing_message,
    metadata,
    updated_at: now,
  }).eq('id', postId);
  if (updErr) console.error('[REPLAY_POST_UPDATE_FAILED] instant', { postId, error: updErr.message });

  return postId as string;
}

export async function createOrUpdateReplayPost(
  admin: SupabaseClient,
  replay: Record<string, any>,
  r2Url: string,
): Promise<string | null> {
  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('id, post_id, live_post_id, title, ended_at, privacy, host_user_id, owner_id, mode')
    .eq('id', replay.live_session_id)
    .maybeSingle();
  const postId = liveSession?.post_id || (liveSession as any)?.live_post_id || null;
  if (!postId) return null;

  const { data: post } = await admin
    .from('posts')
    .select('metadata, content')
    .eq('id', postId)
    .maybeSingle();

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

  const { error: r2UpdErr } = await admin.from('posts').update({
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
  if (r2UpdErr) console.error('[REPLAY_POST_UPDATE_FAILED] r2', { postId, error: r2UpdErr.message });

  return postId as string;
}

export async function upsertCreatorLibrary(
  admin: SupabaseClient,
  replay: Record<string, any>,
  postId: string | null,
): Promise<void> {
  await (admin as any).from('creator_library').upsert({
    user_id: replay.user_id,
    post_id: postId,
    live_session_id: replay.live_session_id,
    live_replay_id: replay.id,
    title: replay.title || 'Live replay',
    media_type: 'video',
    storage_provider: 'r2',
    playback_provider: 'r2',
    r2_object_key: replay.r2_object_key,
    r2_bucket: replay.r2_bucket,
    r2_video_url: replay.r2_video_url,
    thumbnail_url: replay.thumbnail_url,
    duration_seconds: replay.duration_seconds,
    archived_at: replay.archived_at || new Date().toISOString(),
    posted_at: replay.posted_at || replay.auto_posted_at || new Date().toISOString(),
    deleted_at: null,
  }, { onConflict: 'live_replay_id' });
}

````

---

## supabase/functions/admin-replay-debug/index.ts

````ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getStreamVideo } from '../_shared/cloudflareStreamService.ts';
import { abortMultipartUpload } from '../_shared/r2MultipartService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

function accountId(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
}

async function requireAdmin(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, admin, user };
}

async function invokeFunction(name: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (cronSecret) headers['X-Cron-Secret'] = cronSecret;
  const resp = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => null);
  return { httpStatus: resp.status, data };
}

function parsePostId(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const uuid = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];
  return null;
}

function archiveProgress(replay: any) {
  const totalBytes = Number(replay?.mp4_total_bytes || 0);
  const bytesDone = Number(replay?.multipart_bytes_done || 0);
  const totalParts = Number(replay?.multipart_total_parts || 0);
  const partsDone = Array.isArray(replay?.multipart_parts_done) ? replay.multipart_parts_done.length : 0;
  const percent = totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((bytesDone / totalBytes) * 100))) : null;
  return {
    percent,
    bytes_done: bytesDone || null,
    total_bytes: totalBytes || null,
    parts_done: partsDone || null,
    total_parts: totalParts || null,
    part_size: replay?.multipart_part_size || null,
  };
}

function archiveEligibility(replay: any, session: any) {
  const now = Date.now();
  const leaseUntil = replay?.archive_lease_until ? Date.parse(String(replay.archive_lease_until)) : 0;
  const nextRetryAt = replay?.archive_next_retry_at ? Date.parse(String(replay.archive_next_retry_at)) : 0;
  const activePhase = [
    'mp4_export',
    'mp4_wait',
    'multipart_init',
    'multipart_upload',
    'verifying',
    'posting',
    'deleting_stream',
  ].includes(String(replay?.archive_phase || ''));

  if (!replay) return { eligible: false, reason: 'replay_not_found' };
  if (!replay.cloudflare_vod_enabled) return { eligible: false, reason: 'cloudflare_vod_disabled' };
  if (!replay.stream_uid && !replay.cloudflare_video_uid) return { eligible: false, reason: 'missing_stream_uid' };
  if (replay.r2_video_url && replay.replay_post_id) return { eligible: false, reason: 'already_r2_posted' };
  if (session?.status === 'live' && !session?.ended_at) return { eligible: false, reason: 'live_session_active' };
  if (leaseUntil && leaseUntil > now) return { eligible: false, reason: 'archive_lease_held', lease_until: replay.archive_lease_until };
  if (nextRetryAt && nextRetryAt > now && !activePhase) return { eligible: false, reason: 'waiting_next_retry', next_retry_at: replay.archive_next_retry_at };
  if (activePhase) return { eligible: true, reason: `active_phase_${replay.archive_phase}` };
  if (!replay.archive_status || ['pending', 'failed', 'archiving', 'processing_stream', 'stream_ready', 'exporting_mp4', 'uploading_r2', 'verifying_r2', 'archived'].includes(String(replay.archive_status))) {
    return { eligible: true, reason: `archive_status_${replay.archive_status || 'null'}` };
  }
  return { eligible: false, reason: `terminal_or_unsupported_status_${replay.archive_status}` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const guard = await requireAdmin(req.headers.get('Authorization'));
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin;

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'list';
  const replayId = body.replay_id || body.replayId;

  try {
    if (action === 'diagnose_replay_archive') {
      const liveSessionId = body.live_session_id || body.liveSessionId;
      const streamUid = body.stream_uid || body.streamUid;
      const postId = parsePostId(body.post_id || body.postId || body.post_url || body.postUrl);
      const hasTargetSelector = !!(replayId || liveSessionId || streamUid || postId);
      let replay: any = null;

      let query = (admin as any)
        .from('live_replays')
        .select('*');
      if (replayId) query = query.eq('id', replayId);
      else if (liveSessionId) query = query.eq('live_session_id', liveSessionId);
      else if (streamUid) query = query.or(`stream_uid.eq.${streamUid},cloudflare_video_uid.eq.${streamUid}`);
      else if (postId) query = query.eq('replay_post_id', postId);
      else return json({ error: 'Missing replay_id, live_session_id, stream_uid, or post_id' }, 400);

      const { data: replayData, error: replayErr } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (replayErr) throw replayErr;
      replay = replayData;

      let session: any = null;
      if (!replay && postId) {
        const { data: sessionByPost, error: sessionByPostErr } = await (admin as any)
          .from('live_sessions')
          .select('*')
          .or(`post_id.eq.${postId},live_post_id.eq.${postId},replay_post_id.eq.${postId}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sessionByPostErr) throw sessionByPostErr;
        session = sessionByPost;
        if (session?.id) {
          const { data: replayBySession, error: replayBySessionErr } = await (admin as any)
            .from('live_replays')
            .select('*')
            .eq('live_session_id', session.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (replayBySessionErr) throw replayBySessionErr;
          replay = replayBySession;
        }
      }

      if (replay?.live_session_id) {
        const { data, error } = await (admin as any)
          .from('live_sessions')
          .select('*')
          .eq('id', replay.live_session_id)
          .maybeSingle();
        if (error) throw error;
        session = data;
      }

      let post: any = null;
      const resolvedPostId = postId || replay?.replay_post_id || session?.post_id || session?.live_post_id || null;
      if (resolvedPostId) {
        const { data, error } = await (admin as any)
          .from('posts')
          .select('id, post_type, video_url, playback_provider, replay_status, metadata, created_at, updated_at')
          .eq('id', resolvedPostId)
          .maybeSingle();
        if (error) throw error;
        post = data;
      }

      const uid = replay?.stream_uid || replay?.cloudflare_video_uid || session?.cloudflare_video_uid || null;
      const cloudflareVideo = uid ? await getStreamVideo(uid).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      })) : null;

      return json({
        ok: true,
        replay,
        session,
        post,
        cloudflare_video: cloudflareVideo,
        progress: archiveProgress(replay),
        eligibility: archiveEligibility(replay, session),
      });
    }

    if (action === 'list') {
      const { data, error } = await (admin as any)
        .from('live_replays')
        .select(`
          id, live_session_id, chunked_recording_id, user_id, stream_uid, status,
          cloudflare_vod_enabled, storage_provider, playback_provider,
          archive_status, archive_phase, archive_attempts, archive_next_retry_at,
          archive_lease_until, archive_error,
          r2_object_key, r2_bucket, r2_video_url, r2_verified_at,
          replay_post_id, posted_at, auto_posted_at,
          cloudflare_mp4_download_url, mp4_export_started_at, mp4_ready_at,
          multipart_upload_id, multipart_bytes_done, multipart_total_parts, multipart_part_size,
          mp4_total_bytes,
          tus_offset, next_chunk_seq, total_chunks_for_ingest, ingest_attempts,
          last_ingest_at, webhook_received_at, playback_hls, thumbnail_url,
          duration_seconds, error_message, last_error_at, last_webhook_event,
          last_cf_status, last_cf_response, created_at, updated_at
        `)
        .order('created_at', { ascending: false })
        .limit(Number(body.limit || 50));
      if (error) throw error;
      return json({ ok: true, replays: data || [] });
    }

    if (action === 'repair_stuck_r2_archive') {
      const dryRun = body.dry_run !== false;
      const limit = Math.max(1, Math.min(Number(body.limit || 50), 200));
      const { data: rows, error } = await (admin as any)
        .from('live_replays')
        .select(`
          id, live_session_id, user_id, stream_uid, status,
          archive_status, archive_phase, archive_attempts, archive_error,
          archive_next_retry_at, archive_lease_until,
          r2_video_url, r2_object_key, updated_at, created_at
        `)
        .eq('cloudflare_vod_enabled', true)
        .eq('status', 'ready')
        .not('stream_uid', 'is', null)
        .is('r2_video_url', null)
        .or('archive_status.is.null,archive_status.in.(pending,failed,archiving,processing_stream,stream_ready,exporting_mp4,uploading_r2,verifying_r2),archive_phase.in.(mp4_export,mp4_wait,multipart_init,multipart_upload,verifying,posting,deleting_stream)')
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (error) throw error;

      const sessionIds = Array.from(new Set((rows || []).map((row: any) => row.live_session_id).filter(Boolean)));
      const modeBySession = new Map<string, any>();
      if (sessionIds.length) {
        const { data: sessions, error: sessionErr } = await (admin as any)
          .from('live_sessions')
          .select('id, mode, status, ended_at')
          .in('id', sessionIds);
        if (sessionErr) throw sessionErr;
        for (const session of sessions || []) modeBySession.set(session.id, session);
      }

      const candidates = (rows || []).filter((row: any) => modeBySession.get(row.live_session_id)?.mode === 'rtmp_obs');
      if (dryRun) {
        return json({
          ok: true,
          dry_run: true,
          count: candidates.length,
          candidates: candidates.map((row: any) => ({
            ...row,
            session: modeBySession.get(row.live_session_id) || null,
            eligibility: archiveEligibility(row, modeBySession.get(row.live_session_id) || null),
          })),
        });
      }

      const repaired: any[] = [];
      const now = new Date().toISOString();
      for (const replay of candidates) {
        const { data: updated, error: updateErr } = await (admin as any)
          .from('live_replays')
          .update({
            archive_status: replay.archive_status || 'pending',
            archive_attempts: 0,
            archive_error: null,
            error_message: null,
            last_error_at: null,
            archive_lease_until: null,
            archive_next_retry_at: now,
            last_cf_status: 'admin_repair_stuck_r2_archive',
            last_cf_response: {
              by: guard.user.id,
              at: now,
              previous_archive_status: replay.archive_status,
              previous_archive_phase: replay.archive_phase,
              previous_archive_attempts: replay.archive_attempts,
            },
            updated_at: now,
          })
          .eq('id', replay.id)
          .select('id, archive_status, archive_phase, archive_attempts, archive_next_retry_at')
          .maybeSingle();
        const session = modeBySession.get(replay.live_session_id);
        if (session?.status === 'live' && session?.ended_at) {
          await (admin as any).from('live_sessions').update({
            status: 'replay_temp_ready',
            archive_status: 'pending',
            archive_error: null,
            is_input_armed: false,
            updated_at: now,
          }).eq('id', replay.live_session_id);
        }
        if (updateErr) {
          repaired.push({ id: replay.id, ok: false, error: updateErr.message });
        } else {
          repaired.push({ id: replay.id, ok: true, replay: updated });
        }
      }

      const invoked = {
        mp4_poll: await invokeFunction('live-replay-mp4-poll-cron').catch((err) => ({
          error: err instanceof Error ? err.message : String(err),
        })),
        archive: await invokeFunction('live-replay-archive-cron').catch((err) => ({
          error: err instanceof Error ? err.message : String(err),
        })),
      };
      return json({
        ok: true,
        dry_run: false,
        scanned: rows?.length || 0,
        repaired: repaired.length,
        results: repaired,
        invoked,
      });
    }

    if (action === 'repair_long_rtmp_archive') {
      const dryRun = body.dry_run !== false;
      const limit = Math.max(1, Math.min(Number(body.limit || 25), 100));
      const liveSessionId = body.live_session_id || body.liveSessionId;
      const streamUid = body.stream_uid || body.streamUid;
      const postId = parsePostId(body.post_id || body.postId || body.post_url || body.postUrl);

      let targetReplayIds: string[] = [];
      if (replayId) {
        targetReplayIds = [String(replayId)];
      } else if (liveSessionId || streamUid || postId) {
        const diagBody = { action: 'diagnose_replay_archive', replay_id: replayId, live_session_id: liveSessionId, stream_uid: streamUid, post_id: postId };
        let query = (admin as any).from('live_replays').select('id, live_session_id, replay_post_id, stream_uid, cloudflare_video_uid');
        if (liveSessionId) query = query.eq('live_session_id', liveSessionId);
        else if (streamUid) query = query.or(`stream_uid.eq.${streamUid},cloudflare_video_uid.eq.${streamUid}`);
        else if (postId) query = query.eq('replay_post_id', postId);
        const { data: directRows } = await query.order('created_at', { ascending: false }).limit(1);
        targetReplayIds = (directRows || []).map((r: any) => r.id);
        if (!targetReplayIds.length && postId) {
          const { data: sessionByPost } = await (admin as any)
            .from('live_sessions')
            .select('id')
            .or(`post_id.eq.${postId},live_post_id.eq.${postId},replay_post_id.eq.${postId}`)
            .order('created_at', { ascending: false })
            .limit(1);
          const sessionId = sessionByPost?.[0]?.id;
          if (sessionId) {
            const { data: replayBySession } = await (admin as any)
              .from('live_replays')
              .select('id')
              .eq('live_session_id', sessionId)
              .order('created_at', { ascending: false })
              .limit(1);
            targetReplayIds = (replayBySession || []).map((r: any) => r.id);
          }
        }
        if (!targetReplayIds.length) console.warn('[REPAIR_LONG_RTMP_ARCHIVE] no target replay', diagBody);
      }
      if (hasTargetSelector && !targetReplayIds.length) {
        return json({ ok: true, dry_run: true, count: 0, candidates: [], reason: 'target_replay_not_found' });
      }

      let query = (admin as any)
        .from('live_replays')
        .select(`
          id, live_session_id, user_id, stream_uid, cloudflare_video_uid, status,
          archive_status, archive_phase, archive_attempts, archive_error,
          archive_next_retry_at, archive_lease_until,
          r2_video_url, r2_object_key, multipart_upload_id,
          multipart_part_size, multipart_total_parts, multipart_parts_done,
          multipart_bytes_done, mp4_total_bytes, duration_seconds,
          updated_at, created_at
        `)
        .eq('cloudflare_vod_enabled', true)
        .in('status', ['ready', 'processing'])
        .not('stream_uid', 'is', null)
        .is('r2_video_url', null);
      if (targetReplayIds.length) query = query.in('id', targetReplayIds);
      else {
        query = query
          .or('duration_seconds.gte.3600,mp4_total_bytes.gte.1073741824,archive_phase.in.(mp4_wait,multipart_init,multipart_upload,verifying,posting),archive_status.in.(failed,pending,uploading_r2,verifying_r2)')
          .order('updated_at', { ascending: true })
          .limit(limit);
      }

      const { data: rows, error } = await query;
      if (error) throw error;
      const sessionIds = Array.from(new Set((rows || []).map((row: any) => row.live_session_id).filter(Boolean)));
      const sessions = new Map<string, any>();
      if (sessionIds.length) {
        const { data: sessionRows, error: sessionErr } = await (admin as any)
          .from('live_sessions')
          .select('id, mode, status, ended_at')
          .in('id', sessionIds);
        if (sessionErr) throw sessionErr;
        for (const session of sessionRows || []) sessions.set(session.id, session);
      }

      const now = new Date().toISOString();
      const candidates = (rows || [])
        .filter((row: any) => sessions.get(row.live_session_id)?.mode === 'rtmp_obs')
        .map((row: any) => {
          const progress = archiveProgress(row);
          const staleMs = row.updated_at ? Date.now() - Date.parse(String(row.updated_at)) : null;
          const shouldRestartMultipart = !!row.multipart_upload_id
            && Number(row.multipart_part_size || 0) > 32 * 1024 * 1024
            && (Number(staleMs || 0) >= 30 * 60 * 1000 || Number(row.archive_attempts || 0) >= 3);
          return {
            ...row,
            session: sessions.get(row.live_session_id) || null,
            progress,
            should_restart_multipart: shouldRestartMultipart,
            eligibility: archiveEligibility(row, sessions.get(row.live_session_id) || null),
          };
        });

      if (dryRun) {
        return json({ ok: true, dry_run: true, count: candidates.length, candidates });
      }

      const results: any[] = [];
      for (const replay of candidates) {
        const patch: Record<string, unknown> = {
          archive_attempts: 0,
          archive_error: null,
          error_message: null,
          last_error_at: null,
          archive_lease_until: null,
          archive_next_retry_at: now,
          last_cf_status: 'admin_repair_long_rtmp_archive',
          last_cf_response: {
            by: guard.user.id,
            at: now,
            previous_archive_status: replay.archive_status,
            previous_archive_phase: replay.archive_phase,
            previous_archive_attempts: replay.archive_attempts,
            previous_progress: replay.progress,
            restarted_multipart: replay.should_restart_multipart,
          },
          updated_at: now,
        };
        if (!replay.archive_phase) patch.archive_phase = 'mp4_export';
        if (!replay.archive_status) patch.archive_status = 'pending';
        if (replay.should_restart_multipart) {
          try {
            await abortMultipartUpload(replay.r2_object_key, replay.multipart_upload_id);
          } catch (abortErr) {
            console.warn('[REPAIR_LONG_RTMP_ARCHIVE] abort multipart failed (ignored)', {
              replay_id: replay.id,
              err: abortErr instanceof Error ? abortErr.message : String(abortErr),
            });
          }
          patch.archive_phase = 'multipart_init';
          patch.archive_status = 'stream_ready';
          patch.multipart_upload_id = null;
          patch.multipart_parts_done = [];
          patch.multipart_bytes_done = 0;
          patch.multipart_total_parts = null;
          patch.multipart_part_size = null;
        }
        const { data: updated, error: updateErr } = await (admin as any)
          .from('live_replays')
          .update(patch)
          .eq('id', replay.id)
          .select('id, archive_status, archive_phase, archive_attempts, archive_next_retry_at, multipart_part_size')
          .maybeSingle();
        if (replay.session?.status === 'live' && replay.session?.ended_at) {
          await (admin as any).from('live_sessions').update({
            status: 'replay_temp_ready',
            archive_status: 'pending',
            archive_error: null,
            is_input_armed: false,
            updated_at: now,
          }).eq('id', replay.live_session_id);
        }
        results.push(updateErr ? { id: replay.id, ok: false, error: updateErr.message } : { id: replay.id, ok: true, replay: updated });
      }

      const firstReplayId = candidates[0]?.id;
      const invoked = {
        mp4_poll: firstReplayId ? await invokeFunction('live-replay-mp4-poll-cron', { replay_id: firstReplayId }).catch((err) => ({
          error: err instanceof Error ? err.message : String(err),
        })) : null,
        archive: firstReplayId ? await invokeFunction('live-replay-archive-cron', { replay_id: firstReplayId }).catch((err) => ({
          error: err instanceof Error ? err.message : String(err),
        })) : null,
      };
      return json({ ok: true, dry_run: false, repaired: results.length, results, invoked });
    }

    if (action === 'retry_upload') {
      if (!replayId) return json({ error: 'Missing replay_id' }, 400);
      const { data: replay, error: replayErr } = await (admin as any)
        .from('live_replays')
        .select('id, status, cloudflare_vod_enabled')
        .eq('id', replayId)
        .maybeSingle();
      if (replayErr) throw replayErr;
      if (!replay) return json({ error: 'Replay not found' }, 404);
      if (replay.status === 'skipped_legacy' && body.force !== true) {
        return json({
          error: 'Legacy replay is intentionally skipped. Pass force=true to opt it back into Cloudflare VOD.',
        }, 409);
      }
      const { error } = await (admin as any).from('live_replays').update({
        status: 'queued',
        cloudflare_vod_enabled: true,
        ingest_attempts: 0,
        last_ingest_at: null,
        error_message: null,
        last_error_at: null,
        last_cf_status: 'manual_retry_upload',
        last_cf_response: { by: guard.user.id, at: new Date().toISOString() },
      }).eq('id', replayId);
      if (error) throw error;
      const invoked = await invokeFunction('live-replay-stream-ingest');
      return json({ ok: true, invoked });
    }

    if (action === 'retry_webhook_sync' || action === 'force_status_refresh') {
      const invoked = await invokeFunction('live-replay-poll-status');
      return json({ ok: true, invoked });
    }

    if (action === 'test_cloudflare_api') {
      const id = accountId();
      const token = streamToken();
      if (!id || !token) return json({ ok: false, error: 'Missing Cloudflare Stream config' }, 500);
      const listResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream?per_page=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listResp.json().catch(() => null);
      const webhookResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream/webhook`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const webhookData = await webhookResp.json().catch(() => null);
      return json({
        ok: !!listData?.success,
        stream: { httpStatus: listResp.status, success: listData?.success, errors: listData?.errors || [] },
        webhook: { httpStatus: webhookResp.status, success: webhookData?.success, result: webhookData?.result || null, errors: webhookData?.errors || [] },
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('admin-replay-debug error:', error);
    return json({ error: message }, 500);
  }
});

````

---

## supabase/functions/live-replay-archive-cron/index.ts

````ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { detectRtmpLiveConnection, getStreamPlaybackUrls, listStreamLiveInputVideos, selectCurrentLiveInputVideo } from '../_shared/cloudflareStreamService.ts';
import { createOrUpdateInstantReplayPost } from '../_shared/replayFeedService.ts';
import { archiveReplay, cleanupArchivedStreamVideos, pollMp4ForReplay } from '../_shared/archiveReplayService.ts';
import { disconnectGraceExpired, endRtmpLiveSession, getDisconnectGraceSeconds } from '../_shared/rtmpEndLiveService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  return authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    !!(cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
}

async function recoverMissingRtmpReplays(admin: any): Promise<number> {
  const { data: sessions } = await admin
    .from('live_sessions')
    .select('id, owner_id, host_user_id, user_id, cloudflare_live_input_id, cloudflare_video_uid, post_id, live_post_id, title, started_at, go_live_clicked_at, created_at, ended_at, updated_at')
    .eq('mode', 'rtmp_obs')
    .in('status', ['ended', 'replay_temp_ready', 'processing', 'processing_stream', 'stream_ready', 'exporting_mp4', 'archiving_r2', 'uploading_r2', 'verifying_r2', 'failed'])
    .not('cloudflare_live_input_id', 'is', null)
    .or('post_id.not.is.null,live_post_id.not.is.null')
    .order('updated_at', { ascending: true })
    .limit(30);

  let recovered = 0;
  for (const session of sessions || []) {
    const { data: existing } = await admin
      .from('live_replays')
      .select('id')
      .eq('live_session_id', session.id)
      .limit(1)
      .maybeSingle();
    if (existing?.id) continue;

    // Poll 2 láº§n Ã— 1.5s â€” phÃ²ng khi recover cron tá»›i sá»›m hÆ¡n UID materialize.
    let videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
    if (videos.length === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
    }
    const preferred = session.cloudflare_video_uid
      ? videos.find((item: any) => String(item?.uid || '') === String(session.cloudflare_video_uid))
      : null;
    const startRaw = session.go_live_clicked_at || session.started_at || session.created_at || null;
    const startMs = startRaw ? Date.parse(String(startRaw)) : 0;
    const cutoffMs = Number.isFinite(startMs) && startMs > 0 ? startMs - 60_000 : 0;
    const freshVideos = cutoffMs > 0
      ? videos.filter((item: any) => {
          const created = Date.parse(String(item?.created || item?.created_on || '')) || 0;
          return created >= cutoffMs;
        })
      : videos;
    const video = (preferred || selectCurrentLiveInputVideo(freshVideos) || freshVideos.find((item: any) => item?.uid)) as any;
    if (!video?.uid) continue;

    const uid = String(video.uid);
    const urls = getStreamPlaybackUrls(uid);
    await admin.from('live_sessions').update({
      cloudflare_video_uid: uid,
      // NÃ¢ng status sang replay_temp_ready Ä‘á»ƒ FE/Ops tháº¥y cÃ³ replay táº¡m thá»i ngay.
      status: 'replay_temp_ready',
      recording_status: video?.readyToStream ? 'ready' : 'processing',
      recording_ready_at: video?.readyToStream ? new Date().toISOString() : null,
      archive_status: 'pending',
      archive_error: null,
    }).eq('id', session.id).in('status', ['ended', 'failed', 'processing']);

    const { data: replay, error } = await admin.from('live_replays').upsert({
      live_session_id: session.id,
      user_id: session.owner_id || session.host_user_id || session.user_id,
      // RTMP replays do not have a chunked_recordings row; use the live session UUID
      // so this UUID column stays valid and remains one replay per session.
      chunked_recording_id: session.id,
      stream_uid: uid,
      cloudflare_video_uid: uid,
      playback_hls: urls.hls,
      playback_dash: urls.dash,
      playback_mp4: urls.mp4,
      cloudflare_playback_url: urls.hls,
      status: 'ready',
      processing_started_at: new Date().toISOString(),
      storage_provider: 'cloudflare_stream',
      playback_provider: 'cloudflare_temp',
      archive_status: 'pending',
      archive_error: null,
      cloudflare_vod_enabled: true,
      last_cf_response: video,
    }, { onConflict: 'chunked_recording_id' }).select('*').single();
    if (!error) {
      const postId = await createOrUpdateInstantReplayPost(admin as any, replay, urls.hls);
      if (postId && replay?.id) {
        await admin.from('live_replays').update({
          replay_post_id: postId,
          auto_posted_at: replay.auto_posted_at || new Date().toISOString(),
          posted_at: replay.posted_at || new Date().toISOString(),
        }).eq('id', replay.id);
      }
      recovered += 1;
    }
  }
  return recovered;
}

/**
 * ÄÃ¡nh dáº¥u replay vÄ©nh viá»…n khÃ´ng thá»ƒ archive Ä‘Æ°á»£c:
 *   - chunked_recording Ä‘Ã£ FAILED (khÃ´ng cÃ³ chunks)
 *   - chunked_recording total_chunks=0 vÃ  Ä‘Ã£ >1h (Agora khÃ´ng upload Ä‘Æ°á»£c chunks)
 *   - replay káº¹t á»Ÿ queued/normalizing khÃ´ng cÃ³ stream_uid > 24h (concat/ingest fail mÃ£i)
 */
async function markUnrecoverableReplays(admin: any): Promise<{ chunked_failed: number; stuck_queued: number }> {
  // Bucket 1: chunked_recording failed/empty
  const { data: failedRecs } = await admin
    .from('chunked_recordings')
    .select('id')
    .or('status.eq.failed,and(total_chunks.eq.0,created_at.lt.' + new Date(Date.now() - 60 * 60 * 1000).toISOString() + ')')
    .limit(200);
  const failedIds = (failedRecs || []).map((r: any) => r.id);

  let chunked_failed = 0;
  if (failedIds.length) {
    const { data: updated } = await admin
      .from('live_replays')
      .update({
        archive_status: 'unrecoverable',
        archive_error: 'chunked_recording failed/empty (no chunks to archive)',
        archive_next_retry_at: null,
      })
      .in('chunked_recording_id', failedIds)
      .eq('archive_status', 'pending')
      .select('id');
    chunked_failed = (updated || []).length;
  }

  // Bucket 2: replay káº¹t queued/normalizing khÃ´ng cÃ³ stream_uid > 24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: stuckRows } = await admin
    .from('live_replays')
    .update({
      archive_status: 'unrecoverable',
      archive_error: 'stuck in concat/ingest > 24h (Stream /copy or webm concat failed permanently)',
      archive_next_retry_at: null,
    })
    .eq('archive_status', 'pending')
    .in('status', ['queued', 'normalizing'])
    .is('stream_uid', null)
    .lt('created_at', cutoff)
    .select('id');
  const stuck_queued = (stuckRows || []).length;

  if (chunked_failed || stuck_queued) {
    console.log('[ARCHIVE_CRON] markUnrecoverableReplays', { chunked_failed, stuck_queued });
  }
  return { chunked_failed, stuck_queued };
}

async function autoEndDisconnectedRtmpSessions(admin: any): Promise<number> {
  const graceSeconds = getDisconnectGraceSeconds();
  const { data: sessions } = await admin
    .from('live_sessions')
    .select('*')
    .eq('mode', 'rtmp_obs')
    .in('status', ['source_connected', 'ready_to_go_live', 'live', 'disconnect_grace'])
    .not('cloudflare_live_input_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(30);

  let ended = 0;
  for (const session of sessions || []) {
    let detection: any = null;
    try {
      detection = await detectRtmpLiveConnection(session, { skewSeconds: 60 });
    } catch (error) {
      console.warn('[RTMP_WATCHDOG] skip disconnect check: Cloudflare read failed', {
        live_session_id: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const connected = !!detection.connected;
    const now = new Date().toISOString();

    if (connected) {
      const reconnectedPublicLive = session.status === 'disconnect_grace' && (session.post_id || session.live_post_id);
      await admin.from('live_sessions').update({
        status: reconnectedPublicLive
          ? 'live'
          : session.status === 'disconnect_grace'
          ? (session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected')
          : session.status,
        connection_status: 'connected',
        source_connected: true,
        last_disconnected_at: null,
        live_input_status: detection.videoStreaming ? 'live' : 'input_connected_no_video',
        updated_at: now,
      }).eq('id', session.id);
      continue;
    }

    const lastDisconnectedAt = session.last_disconnected_at || now;
    if (!session.last_disconnected_at || session.status !== 'disconnect_grace') {
      await admin.from('live_sessions').update({
        status: 'disconnect_grace',
        connection_status: 'disconnected',
        source_connected: false,
        last_disconnected_at: lastDisconnectedAt,
        updated_at: now,
      }).eq('id', session.id);
    }

    if (!disconnectGraceExpired(lastDisconnectedAt, graceSeconds)) continue;

    // Re-check ngay trÆ°á»›c khi end: náº¿u Cloudflare bÃ¡o cÃ²n liveVideo active â†’ reset, KHÃ”NG end nháº§m.
    let recheck: any = null;
    try {
      recheck = await detectRtmpLiveConnection(session, { skewSeconds: 60 });
    } catch (error) {
      console.warn('[RTMP_WATCHDOG] cancel end: final Cloudflare recheck failed', {
        live_session_id: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (recheck.connected) {
      console.log('[RTMP_WATCHDOG] cancel end (recheck shows connected)', { live_session_id: session.id, reason: recheck.reason });
      const reconnectedPublicLive = session.status === 'disconnect_grace' && (session.post_id || session.live_post_id);
      await admin.from('live_sessions').update({
        status: reconnectedPublicLive ? 'live' : (session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected'),
        connection_status: 'connected',
        source_connected: true,
        last_disconnected_at: null,
        live_input_status: recheck.videoStreaming ? 'live' : 'input_connected_no_video',
        updated_at: new Date().toISOString(),
      }).eq('id', session.id);
      continue;
    }

    await endRtmpLiveSession(admin, { ...session, last_disconnected_at: lastDisconnectedAt }, 'disconnect_timeout');
    ended += 1;
  }

  return ended;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { replay_id, limit = 5, cleanup_limit = 10 } = await req.json().catch(() => ({}));
  const auto_ended_rtmp_sessions = await autoEndDisconnectedRtmpSessions(admin as any);
  const recovered_rtmp_replays = await recoverMissingRtmpReplays(admin as any);
  const marked_unrecoverable = await markUnrecoverableReplays(admin as any).catch((e) => {
    console.warn('[ARCHIVE_CRON] markUnrecoverableReplays failed', String(e));
    return { chunked_failed: 0, stuck_queued: 0 };
  });
  const cleanup_archived_stream_videos = await cleanupArchivedStreamVideos(admin as any, cleanup_limit).catch((error) => ({
    scanned: 0,
    deleted: 0,
    skipped: 0,
    failed: 1,
    results: [{ status: 'cleanup_failed', error: error instanceof Error ? error.message : String(error) }],
  }));

  let replays: any[] = [];
  if (replay_id) {
    const { data } = await (admin as any)
      .from('live_replays')
      .select('id')
      .eq('id', replay_id)
      .limit(1);
    replays = data || [];
  } else {
    const nowIso = new Date().toISOString();
    const staleIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Bucket A â€” replays cáº§n archive tháº­t sá»± (pending / failed / Ä‘ang cháº¡y bá»‹ treo / Ä‘ang á»Ÿ giá»¯a state machine).
    const { data: bucketA } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id, archive_status, archive_phase, archive_attempts, archive_next_retry_at, archive_lease_until, updated_at, replay_post_id, stream_deleted_at, duration_seconds, mp4_total_bytes, multipart_bytes_done')
      .eq('cloudflare_vod_enabled', true)
      .not('stream_uid', 'is', null)
      .in('status', ['ready', 'processing'])
      .or([
        'archive_status.is.null',
        'archive_status.in.(pending,failed,archiving,processing_stream,stream_ready,exporting_mp4,uploading_r2,verifying_r2)',
        'archive_phase.in.(mp4_export,mp4_wait,multipart_init,multipart_upload,verifying,posting,deleting_stream)',
      ].join(','))
      .or(`archive_lease_until.is.null,archive_lease_until.lt.${nowIso}`)
      .order('updated_at', { ascending: true })
      .limit(40);

    // Bucket B â€” finalize stuck 'archived' (thiáº¿u replay_post_id hoáº·c chÆ°a xoÃ¡ Stream).
    const { data: bucketB } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id, archive_status, archive_phase, archive_attempts, archive_next_retry_at, archive_lease_until, updated_at, replay_post_id, stream_deleted_at, duration_seconds, mp4_total_bytes, multipart_bytes_done')
      .eq('cloudflare_vod_enabled', true)
      .not('stream_uid', 'is', null)
      .in('status', ['ready', 'processing'])
      .eq('archive_status', 'archived')
      .or('replay_post_id.is.null,stream_deleted_at.is.null')
      .lt('updated_at', staleIso)
      .order('updated_at', { ascending: true })
      .limit(15);

    const data = [...(bucketA || []), ...(bucketB || [])];

    // Fetch modes to apply per-mode attempts cap (RTMP needs longer, MP4 transcode is slow)
    const sessionIds = Array.from(new Set(data.map((r: any) => r.live_session_id).filter(Boolean)));
    const modeBySession = new Map<string, string>();
    if (sessionIds.length) {
      const { data: sess } = await (admin as any)
        .from('live_sessions').select('id, mode').in('id', sessionIds);
      for (const s of sess || []) modeBySession.set(s.id, s.mode);
    }
    replays = data
      .filter((row: any) => {
        const mode = modeBySession.get(row.live_session_id) || 'agora_webcam';
        const cap = mode === 'rtmp_obs' ? 16 : 8;
        const attempts = Number(row.archive_attempts || 0);
        const activePhase = [
          'mp4_export',
          'mp4_wait',
          'multipart_init',
          'multipart_upload',
          'verifying',
          'posting',
          'deleting_stream',
        ].includes(String(row.archive_phase || ''));
        const recoverableStatus = [
          'stream_ready',
          'exporting_mp4',
          'uploading_r2',
          'verifying_r2',
        ].includes(String(row.archive_status || ''));
        const isStalePending = row.archive_status === 'pending'
          && (!row.updated_at || row.updated_at <= staleIso)
          && (!row.archive_next_retry_at || row.archive_next_retry_at <= nowIso);
        if (activePhase) {
          return !row.archive_next_retry_at || row.archive_next_retry_at <= nowIso;
        }
        if (attempts >= cap && !isStalePending && !recoverableStatus) return false;
        if (!row.archive_status || row.archive_status === 'pending') return true;
        if (row.archive_status === 'failed') {
          return !row.archive_next_retry_at || row.archive_next_retry_at <= nowIso;
        }
        if (['archiving', 'processing_stream', 'stream_ready', 'exporting_mp4', 'uploading_r2', 'verifying_r2'].includes(row.archive_status)) {
          return row.updated_at && row.updated_at <= staleIso;
        }
        if (row.archive_status === 'archived') {
          return row.updated_at && row.updated_at <= staleIso
            && (!(row as any).replay_post_id || !(row as any).stream_deleted_at);
        }
        return false;
      })
      .sort((a: any, b: any) => {
        const aLong = Number(a.duration_seconds || 0) >= 3600 || Number(a.mp4_total_bytes || 0) >= 1024 * 1024 * 1024;
        const bLong = Number(b.duration_seconds || 0) >= 3600 || Number(b.mp4_total_bytes || 0) >= 1024 * 1024 * 1024;
        const aActive = ['mp4_wait', 'multipart_init', 'multipart_upload', 'verifying', 'posting'].includes(String(a.archive_phase || ''));
        const bActive = ['mp4_wait', 'multipart_init', 'multipart_upload', 'verifying', 'posting'].includes(String(b.archive_phase || ''));
        if (aLong !== bLong) return aLong ? -1 : 1;
        if (aActive !== bActive) return aActive ? -1 : 1;
        return new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime();
      })
      .slice(0, Math.min(Number(limit) || 5, 10));
    if (replays.length === 0) {
      console.log('[ARCHIVE_CRON] no eligible replays', { scanned_a: (bucketA || []).length, scanned_b: (bucketB || []).length });
    } else {
      console.log('[ARCHIVE_CRON] picked', { count: replays.length, scanned_a: (bucketA || []).length, scanned_b: (bucketB || []).length });
    }
  }

  const results: any[] = [];
  for (const replay of replays) {
    try {
      // Re-check live_session.status right before archiving to avoid clobbering an active live
      const { data: replayRow } = await (admin as any)
        .from('live_replays').select('live_session_id, archive_phase, status').eq('id', replay.id).maybeSingle();
      if (replayRow?.live_session_id) {
        const { data: sess } = await (admin as any)
          .from('live_sessions').select('status, ended_at').eq('id', replayRow.live_session_id).maybeSingle();
        if (sess?.status === 'live' && !sess?.ended_at) {
          results.push({ ok: true, replay_id: replay.id, status: 'skipped_live_in_progress' });
          continue;
        }
        if (sess?.status === 'live' && sess?.ended_at && replayRow?.status === 'ready') {
          await (admin as any).from('live_sessions').update({
            status: 'replay_temp_ready',
            archive_status: 'pending',
            updated_at: new Date().toISOString(),
          }).eq('id', replayRow.live_session_id);
        }
      }
      if (replayRow?.archive_phase === 'mp4_wait') {
        results.push(await pollMp4ForReplay(admin, replay.id));
        continue;
      }
      results.push(await archiveReplay(admin, replay.id));
    } catch (error) {
      results.push({
        ok: false,
        replay_id: replay.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return json({
    ok: true,
    auto_ended_rtmp_sessions,
    recovered_rtmp_replays,
    marked_unrecoverable,
    cleanup_archived_stream_videos,
    processed: results.length,
    results,
  });
});

````

---

## src/components/feed/PostMedia.tsx

````tsx
import { useMemo, memo } from 'react';
import { MediaGrid } from './MediaGrid';
import { LivePostEmbed } from './LivePostEmbed';
import { HeartAnimation } from './HeartAnimation';
import { Radio } from 'lucide-react';
import type { PostData } from './types';

interface PostMediaProps {
  post: PostData;
  showHeartAnimation: boolean;
  onHeartComplete: () => void;
  onDoubleTap: () => void;
}

export const PostMedia = memo(function PostMedia({
  post, showHeartAnimation, onHeartComplete, onDoubleTap,
}: PostMediaProps) {
  const metadata = post.metadata;
  const postAny = post as unknown as Record<string, unknown>;
  const isLive = post.post_type === 'live' || post.post_type === 'live_replay';
  const liveStatus = (postAny.live_status as string | undefined) || (metadata?.live_status as string | undefined);
  const isEndedLive = isLive && liveStatus === 'ended';

  const colReplayReady = postAny.replay_ready === true;
  const colReplayStatus = postAny.replay_status as string | undefined;
  const colPlaybackProvider = postAny.playback_provider as string | undefined;
  const colProcessingMsg = postAny.processing_message as string | undefined;

  const isR2ReplayReady = isEndedLive
    && (colReplayReady || metadata?.replay_ready === true || colReplayStatus === 'ready' || metadata?.replay_status === 'ready' || metadata?.archive_status === 'archived')
    && (colPlaybackProvider === 'r2' || metadata?.playback_provider === 'r2' || metadata?.playback_type === 'r2')
    && !!(metadata?.r2_video_url || metadata?.playback_url || post.video_url);
  const isTempReplayReady = isEndedLive
    && (colReplayReady || metadata?.replay_ready === true || colReplayStatus === 'ready' || metadata?.replay_status === 'ready')
    && (colPlaybackProvider === 'cloudflare_temp'
      || metadata?.playback_provider === 'cloudflare_temp'
      || metadata?.playback_type === 'cloudflare_temp')
    && !!(metadata?.cloudflare_playback_url || metadata?.playback_hls || metadata?.playback_url || post.video_url);

  const archiveStatus = metadata?.archive_status as string | undefined;
  const archiveProgressPercent = typeof metadata?.archive_progress_percent === 'number'
    ? Math.max(0, Math.min(99, Math.round(metadata.archive_progress_percent)))
    : null;
  const replayStatusText = colProcessingMsg
    || (metadata?.processing_message as string | undefined)
    || (colReplayStatus === 'failed' || archiveStatus === 'failed' || archiveStatus === 'unrecoverable'
      ? 'KhÃ´ng thá»ƒ xá»­ lÃ½ video replay. Vui lÃ²ng thá»­ láº¡i sau.'
      : 'Äang xá»­ lÃ½ video replay. Video sáº½ sáºµn sÃ ng sau Ã­t phÃºt.');

  const mediaItems = useMemo(() => {
    const items: Array<{ url: string; type: 'image' | 'video'; poster?: string; isLiveReplay?: boolean }> = [];
    const r2Url = isLive
      ? ((metadata?.r2_video_url as string | undefined)
        || ((metadata?.playback_provider === 'r2' || metadata?.playback_type === 'r2')
          ? (metadata?.playback_url as string | undefined)
          : undefined))
      : undefined;
    const hlsUrl = isLive && !isEndedLive ? (metadata?.playback_hls as string | undefined) : undefined;
    const tempReplayUrl = isTempReplayReady
      ? ((metadata?.cloudflare_playback_url as string | undefined)
        || (metadata?.playback_hls as string | undefined)
        || (metadata?.playback_url as string | undefined)
        || post.video_url
        || undefined)
      : undefined;
    const chunkedFallbackUrl = isLive && metadata?.allow_chunked_fallback
      ? ((metadata?.fallback_playback_url as string | undefined) || (metadata?.playback_url as string | undefined))
      : undefined;
    const liveVideoUrl = isEndedLive
      ? (isR2ReplayReady ? (r2Url || post.video_url || undefined) : tempReplayUrl)
      : (r2Url || hlsUrl || chunkedFallbackUrl || (isLive ? (post.video_url || undefined) : undefined));
    const poster = metadata?.thumbnail_url as string | undefined;

    if (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0) {
      if (isLive) {
        if (!liveVideoUrl) return [];
        return post.media_urls.map(m => ({
          ...m,
          url: m.type === 'video' ? liveVideoUrl : m.url,
          isLiveReplay: m.type === 'video',
          poster: m.type === 'video' ? poster : undefined,
        }));
      }
      return post.media_urls;
    }

    if (post.image_url) {
      items.push({ url: post.image_url, type: 'image' as const });
    }
    const videoUrl = isLive ? liveVideoUrl : post.video_url;
    if (videoUrl) {
      items.push({ url: videoUrl, type: 'video' as const, poster, isLiveReplay: isLive });
    }
    return items;
  }, [post.media_urls, post.image_url, post.video_url, metadata, isLive, isEndedLive, isR2ReplayReady, isTempReplayReady]);

  if (isLive && metadata?.live_status === 'live') {
    return (
      <LivePostEmbed
        metadata={metadata}
        hostName={post.profiles?.display_name || post.profiles?.username || ''}
      />
    );
  }

  const showOptimizingOverlay = isTempReplayReady && !isR2ReplayReady && mediaItems.length > 0;
  const optimizingText = colProcessingMsg
    || (metadata?.processing_message as string | undefined)
    || (archiveProgressPercent && archiveProgressPercent > 0
      ? `Äang lÆ°u video sang R2 ${archiveProgressPercent}%. Báº¡n váº«n cÃ³ thá»ƒ xem láº¡i ngay.`
      : null)
    || 'Äang tá»‘i Æ°u video replayâ€¦';

  return (
    <div className="relative" onClick={onDoubleTap}>
      {mediaItems.length > 0 ? (
        <MediaGrid media={mediaItems} feedId={post.id} />
      ) : isEndedLive ? (
        metadata?.recording_failed ? (
          <div className="flex items-center justify-center p-6 bg-muted/50 text-muted-foreground text-sm gap-2">
            <Radio className="w-4 h-4" />
            <span>PhiÃªn live nÃ y khÃ´ng cÃ³ báº£n ghi</span>
          </div>
        ) : (
          <div className="flex items-center justify-center p-6 bg-muted/50 text-muted-foreground text-sm gap-2">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>{replayStatusText}</span>
          </div>
        )
      ) : null}
      {showOptimizingOverlay && (
        <div
          className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
          aria-live="polite"
        >
          <Radio className="h-3 w-3 animate-pulse" />
          <span>{optimizingText}</span>
        </div>
      )}
      <HeartAnimation show={showHeartAnimation} onComplete={onHeartComplete} />
    </div>
  );
});

````

---

## src/pages/AdminReplayDebug.tsx

````tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Satellite, Shield, TestTube2, Trash2, Search, Wrench, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FacebookNavbar } from "@/components/layout/FacebookNavbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminRole } from "@/hooks/useAdminRole";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type ReplayDebugRow = {
  id: string;
  live_session_id: string;
  chunked_recording_id: string | null;
  stream_uid: string | null;
  status: string;
  cloudflare_vod_enabled: boolean;
  archive_status: string | null;
  archive_phase: string | null;
  archive_attempts: number | null;
  archive_next_retry_at: string | null;
  r2_video_url: string | null;
  mp4_total_bytes: number | null;
  multipart_bytes_done: number | null;
  multipart_total_parts: number | null;
  multipart_part_size: number | null;
  tus_offset: number;
  next_chunk_seq: number;
  total_chunks_for_ingest: number | null;
  ingest_attempts: number;
  last_ingest_at: string | null;
  webhook_received_at: string | null;
  playback_hls: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  last_error_at: string | null;
  last_webhook_event: string | null;
  last_cf_status: string | null;
  last_cf_response: unknown;
  created_at: string;
  updated_at: string;
};

const STUCK_PHASES = new Set([
  "mp4_wait",
  "multipart_init",
  "multipart_upload",
  "posting",
  "exporting_mp4",
  "uploading_r2",
  "verifying_r2",
]);
const STUCK_STATUSES = new Set([
  "pending",
  "failed",
  "exporting_mp4",
  "stream_ready",
  "uploading_r2",
  "verifying_r2",
  "archiving",
  "processing_stream",
]);

const statusClass: Record<string, string> = {
  ready: "bg-emerald-500 text-white",
  processing: "bg-blue-500 text-white",
  uploading: "bg-amber-500 text-white",
  queued: "bg-slate-500 text-white",
  failed: "bg-destructive text-destructive-foreground",
  skipped_legacy: "bg-zinc-400 text-white",
};

async function callDebug(action: string, replayId?: string, extra?: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Admin session required");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-replay-debug`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, replay_id: replayId, ...(extra || {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function shortId(id: string | null | undefined) {
  return id ? `${id.slice(0, 8)}...${id.slice(-4)}` : "-";
}

function fmtDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function archiveProgress(row: ReplayDebugRow) {
  const total = Number(row.mp4_total_bytes || 0);
  const done = Number(row.multipart_bytes_done || 0);
  if (!total) return "-";
  return `${Math.round((done / total) * 100)}%`;
}

export default function AdminReplayDebug() {
  const navigate = useNavigate();
  const { isAdmin, isLoading } = useAdminRole();
  const [rows, setRows] = useState<ReplayDebugRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [cfResult, setCfResult] = useState<unknown>(null);

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      toast.error("Báº¡n khÃ´ng cÃ³ quyá»n truy cáº­p trang nÃ y");
      navigate("/");
    }
  }, [isAdmin, isLoading, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callDebug("list");
      setRows(data.replays || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "KhÃ´ng táº£i ï¿½â€˜Æ°á»£c replay debug");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const stats = useMemo(() => ({
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    active: rows.filter((r) => r.cloudflare_vod_enabled && ["queued", "uploading", "processing"].includes(r.status)).length,
    failed: rows.filter((r) => r.status === "failed").length,
  }), [rows]);

  const runAction = async (action: string, replayId?: string, extra?: Record<string, unknown>) => {
    setBusyAction(`${action}:${replayId || "global"}`);
    try {
      const data = await callDebug(action, replayId, extra);
      if (
        action === "test_cloudflare_api" ||
        action === "repair_stuck_r2_archive" ||
        action === "repair_long_rtmp_archive" ||
        action === "diagnose_replay_archive"
      ) setCfResult(data);
      toast.success("ÄÃ£ cháº¡y thao tÃ¡c debug");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Thao tÃ¡c tháº¥t báº¡i");
    } finally {
      setBusyAction(null);
    }
  };

  const stuckRows = useMemo(
    () => rows.filter((r) =>
      !r.r2_video_url && (
        (r.archive_phase && STUCK_PHASES.has(r.archive_phase)) ||
        (r.archive_status && STUCK_STATUSES.has(r.archive_status))
      )
    ),
    [rows],
  );

  const groupedStuck = useMemo(() => {
    const map = new Map<string, ReplayDebugRow[]>();
    for (const r of stuckRows) {
      const key = `${r.archive_status || "null"} / ${r.archive_phase || "null"}`;
      const arr = map.get(key) || [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [stuckRows]);

  const hourlyBuckets = useMemo(() => {
    const now = Date.now();
    const buckets = [
      { label: "< 1h", min: 0, max: 1 },
      { label: "1â€“6h", min: 1, max: 6 },
      { label: "6â€“24h", min: 6, max: 24 },
      { label: "1â€“3 ngÃ y", min: 24, max: 72 },
      { label: "> 3 ngÃ y", min: 72, max: Infinity },
    ];
    return buckets.map((b) => ({
      ...b,
      count: stuckRows.filter((r) => {
        const ageH = (now - new Date(r.updated_at).getTime()) / 3_600_000;
        return ageH >= b.min && ageH < b.max;
      }).length,
    }));
  }, [stuckRows]);

  if (isLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="mx-auto max-w-7xl px-4 py-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary rounded-lg text-primary-foreground">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Replay Debug</h1>
                <p className="text-sm text-muted-foreground">Cloudflare Stream ingest, webhook, and HLS readiness</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button variant="outline" onClick={() => runAction("force_status_refresh")} disabled={!!busyAction}>
                <Satellite className="mr-2 h-4 w-4" />
                Force status refresh
              </Button>
              <Button onClick={() => runAction("test_cloudflare_api")} disabled={!!busyAction}>
                <TestTube2 className="mr-2 h-4 w-4" />
                Test Cloudflare API
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  setBusyAction("orphan_dry");
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-orphan-cleanup`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ dry_run: true }),
                    });
                    const data = await res.json();
                    setCfResult(data);
                    toast.success(`QuÃ©t xong: ${data.cf_total} UID trÃªn CF, ${data.candidates_total} cÃ³ thá»ƒ xoÃ¡`);
                  } catch (e) { toast.error(String(e)); } finally { setBusyAction(null); }
                }}
                disabled={!!busyAction}
              >
                <Search className="mr-2 h-4 w-4" />
                QuÃ©t orphan CF Stream
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!confirm("XoÃ¡ tháº­t cÃ¡c UID orphan + archived trÃªn Cloudflare Stream? (tá»‘i Ä‘a 200 UID/láº§n)")) return;
                  setBusyAction("orphan_delete");
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-orphan-cleanup`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ dry_run: false, max_delete: 200 }),
                    });
                    const data = await res.json();
                    setCfResult(data);
                    toast.success(`ÄÃ£ xoÃ¡ ${data.deleted_count}/${data.candidates_total} UID. CÃ²n láº¡i sáº½ xoÃ¡ á»Ÿ láº§n sau.`);
                  } catch (e) { toast.error(String(e)); } finally { setBusyAction(null); }
                }}
                disabled={!!busyAction}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Dá»n orphan (xoÃ¡ tháº­t)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(stats).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">{label}</div>
                  <div className="text-2xl font-semibold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {cfResult !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cloudflare API Result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(cfResult, null, 2)}</pre>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="recent" className="w-full">
            <TabsList>
              <TabsTrigger value="recent">Recent Replays</TabsTrigger>
              <TabsTrigger value="stuck">
                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                Replay káº¹t ({stuckRows.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recent">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Replays</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Replay</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Stream UID</TableHead>
                        <TableHead>TUS</TableHead>
                        <TableHead>Webhook</TableHead>
                        <TableHead>Playback</TableHead>
                        <TableHead>Last Error</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="min-w-48">
                            <div className="font-mono text-xs">{shortId(row.id)}</div>
                            <div className="text-xs text-muted-foreground">{fmtDate(row.created_at)}</div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusClass[row.status] || ""}>{row.status}</Badge>
                            {!row.cloudflare_vod_enabled && (
                              <div className="mt-1 text-xs text-muted-foreground">legacy chunk fallback</div>
                            )}
                            <div className="mt-1 text-xs text-muted-foreground">{row.last_cf_status || "-"}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{shortId(row.stream_uid)}</TableCell>
                          <TableCell className="text-xs">
                            <div>offset: {Number(row.tus_offset || 0).toLocaleString()}</div>
                            <div>next seq: {row.next_chunk_seq} / {row.total_chunks_for_ingest ?? "-"}</div>
                            <div>attempts: {row.ingest_attempts}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{row.last_webhook_event || "-"}</div>
                            <div className="text-muted-foreground">{fmtDate(row.webhook_received_at)}</div>
                          </TableCell>
                          <TableCell className="max-w-64 text-xs">
                            <div className="truncate" title={row.playback_hls || ""}>HLS: {row.playback_hls || "-"}</div>
                            <div className="truncate" title={row.thumbnail_url || ""}>Thumb: {row.thumbnail_url || "-"}</div>
                          </TableCell>
                          <TableCell className="max-w-64 text-xs">
                            <div className="line-clamp-3">{row.error_message || "-"}</div>
                            <div className="text-muted-foreground">{fmtDate(row.last_error_at)}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runAction("retry_upload", row.id)}
                                disabled={!!busyAction || row.status === "skipped_legacy"}
                              >
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                Upload
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => runAction("retry_webhook_sync", row.id)}
                                disabled={!!busyAction}
                              >
                                Sync
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                            No replay records found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stuck" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">PhÃ¢n bá»• theo Ä‘á»™ tuá»•i (updated_at)</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tá»•ng {stuckRows.length} replay Ä‘ang káº¹t (chÆ°a cÃ³ r2_video_url).
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAction("repair_stuck_r2_archive", undefined, { dry_run: true, limit: 100 })}
                      disabled={!!busyAction}
                    >
                      <Search className="mr-1 h-3.5 w-3.5" />
                      Preview repair
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!confirm(`Repair nhanh tá»‘i Ä‘a 100 replay RTMP káº¹t vÃ  Ä‘Æ°a láº¡i vÃ o pipeline?`)) return;
                        void runAction("repair_stuck_r2_archive", undefined, { dry_run: false, limit: 100 });
                      }}
                      disabled={!!busyAction || stuckRows.length === 0}
                    >
                      <Wrench className="mr-1 h-3.5 w-3.5" />
                      Repair nhanh (Ã—100)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAction("repair_long_rtmp_archive", undefined, { dry_run: true, limit: 50 })}
                      disabled={!!busyAction}
                    >
                      <Search className="mr-1 h-3.5 w-3.5" />
                      Preview long video
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!confirm("Repair long/stuck RTMP replays and kick archive again?")) return;
                        void runAction("repair_long_rtmp_archive", undefined, { dry_run: false, limit: 50 });
                      }}
                      disabled={!!busyAction || stuckRows.length === 0}
                    >
                      <Wrench className="mr-1 h-3.5 w-3.5" />
                      Repair long video
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    {hourlyBuckets.map((b) => (
                      <div key={b.label} className="rounded border p-3">
                        <div className="text-xs uppercase text-muted-foreground">{b.label}</div>
                        <div className="text-2xl font-semibold">{b.count}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sá»‘ lÆ°á»£ng theo archive_status / archive_phase</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>archive_status / archive_phase</TableHead>
                        <TableHead className="text-right">Sá»‘ lÆ°á»£ng</TableHead>
                        <TableHead>CÅ© nháº¥t (updated_at)</TableHead>
                        <TableHead>Má»›i nháº¥t</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedStuck.map((g) => {
                        const sorted = [...g.items].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
                        return (
                          <TableRow key={g.key}>
                            <TableCell className="font-mono text-xs">{g.key}</TableCell>
                            <TableCell className="text-right font-semibold">{g.items.length}</TableCell>
                            <TableCell className="text-xs">{fmtDate(sorted[0]?.updated_at)}</TableCell>
                            <TableCell className="text-xs">{fmtDate(sorted[sorted.length - 1]?.updated_at)}</TableCell>
                          </TableRow>
                        );
                      })}
                      {groupedStuck.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                            KhÃ´ng cÃ³ replay nÃ o Ä‘ang káº¹t ðŸŽ‰
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Chi tiáº¿t replay káº¹t ({stuckRows.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Replay</TableHead>
                        <TableHead>archive_status</TableHead>
                        <TableHead>archive_phase</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>R2 progress</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead>Last Error</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stuckRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="min-w-48">
                            <div className="font-mono text-xs">{shortId(row.id)}</div>
                            <div className="text-xs text-muted-foreground">{fmtDate(row.created_at)}</div>
                          </TableCell>
                          <TableCell className="text-xs">{row.archive_status || "-"}</TableCell>
                          <TableCell className="text-xs">{row.archive_phase || "-"}</TableCell>
                          <TableCell className="text-xs">{row.archive_attempts ?? 0}</TableCell>
                          <TableCell className="text-xs">
                            <div>{archiveProgress(row)}</div>
                            <div className="text-muted-foreground">
                              {row.multipart_total_parts ? `${Number(row.multipart_bytes_done || 0).toLocaleString()} / ${Number(row.mp4_total_bytes || 0).toLocaleString()} bytes` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{fmtDate(row.updated_at)}</TableCell>
                          <TableCell className="max-w-64 text-xs">
                            <div className="line-clamp-2">{row.error_message || "-"}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runAction("diagnose_replay_archive", row.id)}
                                disabled={!!busyAction}
                              >
                                <Search className="mr-1 h-3.5 w-3.5" />
                                Diagnose
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runAction("repair_long_rtmp_archive", row.id, { dry_run: false })}
                                disabled={!!busyAction}
                              >
                                <Wrench className="mr-1 h-3.5 w-3.5" />
                                Repair
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => runAction("retry_webhook_sync", row.id)}
                                disabled={!!busyAction}
                              >
                                Sync
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

````

---

## supabase/migrations/20260518100000_long_rtmp_replay_archive_repair.sql

````sql
-- Make long RTMP replay archive more resilient and visible.
-- Cloudflare Stream remains temporary storage; R2 is the final verified storage.

CREATE OR REPLACE FUNCTION public.live_replays_patch(p_id uuid, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r live_replays%ROWTYPE;
  merged live_replays%ROWTYPE;
BEGIN
  SELECT * INTO r FROM live_replays WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  merged := jsonb_populate_record(r, p_patch);
  UPDATE live_replays SET
    archive_phase                = merged.archive_phase,
    archive_status               = merged.archive_status,
    archive_attempts             = merged.archive_attempts,
    archive_lease_until          = merged.archive_lease_until,
    archive_next_retry_at        = merged.archive_next_retry_at,
    archive_error                = merged.archive_error,
    archived_at                  = merged.archived_at,
    last_error_at                = merged.last_error_at,
    error_message                = merged.error_message,
    multipart_upload_id          = merged.multipart_upload_id,
    multipart_parts_done         = merged.multipart_parts_done,
    multipart_bytes_done         = merged.multipart_bytes_done,
    multipart_total_parts        = merged.multipart_total_parts,
    multipart_part_size          = merged.multipart_part_size,
    mp4_export_started_at        = merged.mp4_export_started_at,
    mp4_ready_at                 = merged.mp4_ready_at,
    mp4_total_bytes              = merged.mp4_total_bytes,
    cloudflare_mp4_download_url  = merged.cloudflare_mp4_download_url,
    stream_deleted_at            = merged.stream_deleted_at,
    cloudflare_deleted_at        = merged.cloudflare_deleted_at,
    delete_stream_error          = merged.delete_stream_error,
    r2_object_key                = merged.r2_object_key,
    r2_bucket                    = merged.r2_bucket,
    r2_video_url                 = merged.r2_video_url,
    r2_verified_at               = merged.r2_verified_at,
    replay_post_id               = merged.replay_post_id,
    replay_ready_at              = merged.replay_ready_at,
    posted_at                    = merged.posted_at,
    auto_posted_at               = merged.auto_posted_at,
    duration_seconds             = merged.duration_seconds,
    deleted_at                   = merged.deleted_at,
    filesize_bytes               = merged.filesize_bytes,
    playback_mp4                 = merged.playback_mp4,
    playback_provider            = merged.playback_provider,
    storage_provider             = merged.storage_provider,
    status                       = merged.status,
    expires_at                   = merged.expires_at,
    last_cf_status               = merged.last_cf_status,
    last_cf_response             = merged.last_cf_response,
    updated_at                   = now()
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_replays_patch(uuid, jsonb) TO service_role;

DO $$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN (
      'live-replay-archive-every-1min',
      'live-replay-archive-every-2min',
      'rtmp-live-watchdog-every-1min',
      'live-replay-mp4-poll-every-1min'
    )
    OR jobname LIKE 'live-replay-mp4-poll%'
  LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;
END $$;

SELECT cron.schedule(
  'live-replay-archive-every-1min',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-replay-archive-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"limit":12,"cleanup_limit":10}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'live-replay-mp4-poll-every-1min',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-replay-mp4-poll-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"limit":40}'::jsonb
  );
  $$
);

UPDATE public.live_sessions ls
SET status = 'replay_temp_ready',
    archive_status = COALESCE(ls.archive_status, 'pending'),
    archive_error = NULL,
    source_connected = false,
    is_input_armed = false,
    updated_at = now()
WHERE ls.mode = 'rtmp_obs'
  AND ls.status = 'live'
  AND ls.ended_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.live_replays lr
    WHERE lr.live_session_id = ls.id
      AND lr.status = 'ready'
      AND lr.r2_video_url IS NULL
      AND COALESCE(lr.stream_uid, lr.cloudflare_video_uid) IS NOT NULL
  );

UPDATE public.live_replays lr
SET archive_status = CASE
      WHEN lr.archive_status = 'unrecoverable' THEN 'pending'
      ELSE COALESCE(lr.archive_status, 'pending')
    END,
    archive_attempts = 0,
    archive_error = NULL,
    error_message = NULL,
    last_error_at = NULL,
    archive_lease_until = NULL,
    archive_next_retry_at = now(),
    last_cf_status = 'migration_repair_long_rtmp_archive',
    updated_at = now()
FROM public.live_sessions ls
WHERE lr.live_session_id = ls.id
  AND ls.mode = 'rtmp_obs'
  AND lr.cloudflare_vod_enabled = true
  AND lr.status = 'ready'
  AND COALESCE(lr.stream_uid, lr.cloudflare_video_uid) IS NOT NULL
  AND lr.r2_video_url IS NULL
  AND (
    lr.duration_seconds >= 3600
    OR lr.mp4_total_bytes >= 1073741824
    OR lr.archive_phase IN ('mp4_wait','multipart_init','multipart_upload','verifying','posting')
    OR lr.archive_status IN ('pending','failed','archiving','processing_stream','stream_ready','exporting_mp4','uploading_r2','verifying_r2')
    OR (
      lr.archive_status = 'unrecoverable'
      AND COALESCE(lr.archive_error, '') !~* '(404|not found|khÃ´ng cÃ²n|deleted)'
    )
  );

````
