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
// Mỗi cron tick chỉ chạy 1 phase + 1 đơn vị công việc nhỏ → < 30s wall-time.
const Phase = {
  MP4_EXPORT: 'mp4_export',         // gọi POST /downloads (1 lần idempotent)
  MP4_WAIT: 'mp4_wait',             // đợi CF transcode (poll cron riêng)
  MULTIPART_INIT: 'multipart_init', // HEAD MP4 + CreateMultipartUpload R2
  MULTIPART_UPLOAD: 'multipart_upload', // upload từng part 1
  VERIFYING: 'verifying',           // CompleteMultipart + verify R2
  POSTING: 'posting',               // switch post sang R2
  DELETING_STREAM: 'deleting_stream', // xoá CF Stream UID
  DONE: 'done',
} as const;

// V2 (17/05/2026): part 16MB + 4 parts/tick + 40s budget rút archive video 2h từ ~30' xuống ~10-15'.
const PART_SIZE = 16 * 1024 * 1024; // 16 MB — video 2h ≈ 150 parts; fetch range nhanh hơn, ít rủi ro timeout giữa chừng.
const SINGLE_PUT_THRESHOLD = 100 * 1024 * 1024; // < 100MB dùng single PUT cũ
const LEASE_MINUTES = 3; // lease ngắn hơn vì mỗi tick xử lý xong nhanh hơn
const MULTIPART_MAX_PARTS_PER_TICK = 4;
const MULTIPART_TICK_BUDGET_MS = 40_000; // chừa 20s buffer trong Edge 60s timeout cho commit DB + release lease
const STUCK_LARGE_MULTIPART_MS = 30 * 60 * 1000;
const STUCK_PART_SIZE_FAIL_THRESHOLD = 4;
const STUCK_PART_SIZE_STALE_MS = 45 * 60 * 1000;

function r2PublicUrlForKey(key: string): string {
  const publicUrl = Deno.env.get('R2_PUBLIC_DOMAIN') || Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
  if (!publicUrl) throw new Error('Missing R2 public URL config');
  return `${publicUrl.replace(/\/$/, '')}/${key}`;
}

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
 * Dọn webm nguồn + chunks trên R2 sau khi MP4 đã archive thành công.
 * - CHỈ chạy khi: r2_video_url HEAD ok + replay_post_id tồn tại + archive_status='archived'.
 * - Idempotent: nếu cờ webm_source_deleted_at / chunks_deleted_at đã set → bỏ qua.
 * - KHÔNG ném lỗi: cleanup là bonus, fail không ảnh hưởng archive.
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

  // Đánh dấu pending TRƯỚC khi gọi DELETE để watchdog thấy được nếu fail giữa chừng.
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
    // Nếu replay đã có post + R2 ổn → tiến thẳng terminal ARCHIVED để cleanup cron không phải re-scan
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

    // Xoá thêm UID gốc của live_sessions nếu khác (Cloudflare tạo 2 video: 1 lúc đang phát + 1 từ /copy)
    try {
      const { data: sess } = await (admin as any)
        .from('live_sessions')
        .select('cloudflare_video_uid, cloudflare_live_input_id')
        .eq('id', replay.live_session_id)
        .maybeSingle();
      // Lấy thêm tất cả video CF tạo từ live input để xoá hết
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

async function recordTransientFailure(
  admin: SupabaseClient,
  replay: any,
  message: string,
  opts: { quickRetry?: boolean; rateLimited?: boolean; retryAfterSeconds?: number } = {},
) {
  // 429 rate-limit: KHÔNG tăng attempts (tránh ăn vào trần cap), retry sau retryAfter (default 45s).
  const isRateLimited = !!opts.rateLimited;
  const attempts = isRateLimited
    ? Number(replay.archive_attempts || 0)
    : Number(replay.archive_attempts || 0) + 1;
  const retryIso = isRateLimited
    ? new Date(Date.now() + Math.max(20, Math.min(120, opts.retryAfterSeconds ?? 45)) * 1000).toISOString()
    : (opts.quickRetry
        ? new Date(Date.now() + 2 * 60 * 1000).toISOString()
        : nextRetryIso(attempts));
  const errorText = isRateLimited
    ? `rate_limited_429: ${message}`.slice(0, 1000)
    : message.slice(0, 1000);
  await patchReplay(admin, replay.id, {
    archive_attempts: attempts,
    archive_error: errorText,
    archive_next_retry_at: retryIso,
    last_error_at: new Date().toISOString(),
    error_message: errorText,
    archive_lease_until: null,
  });
}

async function markUnrecoverable(admin: SupabaseClient, replay: any, reason: string, kind: 'mp4_stuck_zero' | 'stream_404') {
  const uid = replay.stream_uid || replay.cloudflare_video_uid;
  console.warn('[ARCHIVE_UNRECOVERABLE_KEEP_STREAM]', { replay_id: replay.id, uid, kind });
  // Nếu có multipart đang dở → abort để giải phóng R2 storage
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
  // Notify user 1 lần
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
        title: 'Bản ghi livestream không lưu được',
        body: 'Phiên livestream của bạn không thể lưu lại do nguồn video bị gián đoạn. Lần sau hãy đảm bảo OBS chạy đủ ít nhất 1 phút trước khi kết thúc nhé.',
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
  // Đẩy progress message thân thiện sang post (mp4_wait: chưa có bytes, hiện "Cloudflare đang xử lý...")
  await updateReplayPostArchiveProgress(admin, replay, {
    phase: Phase.MP4_WAIT, bytesDone: 0, totalBytes: 0, partsDone: 0, totalParts: 0,
  }).catch((e) => console.warn('[MP4_EXPORT_PROGRESS_WARN]', e));
  return { ok: true, replay_id: replay.id, phase: Phase.MP4_WAIT, percentComplete: result.percentComplete };
}

async function runMultipartInit(admin: SupabaseClient, replay: any): Promise<Record<string, unknown>> {
  const uid = replay.stream_uid || replay.cloudflare_video_uid;
  if (!uid) throw new Error('Missing Cloudflare Stream UID');
  if (!replay.cloudflare_mp4_download_url) {
    // Lấy lại URL nếu chưa lưu
    const status = await requestMp4Download(uid);
    if (!status.ready || !status.url) {
      throw new Error(`Cloudflare MP4 not ready (${status.percentComplete ?? 0}%)`);
    }
    replay.cloudflare_mp4_download_url = status.url;
  }
  const totalBytes = await headContentLength(replay.cloudflare_mp4_download_url);
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) throw new Error('Invalid MP4 content length');

  const objectKey = replay.r2_object_key || `live-replays/${replay.user_id}/${replay.live_session_id}/${uid}.mp4`;

  // ===== Fallback single PUT cho file < 100MB (Agora replay ngắn) =====
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
    // Tìm part đầu tiên CHƯA upload
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
    // Tất cả parts đã xong → chuyển verify
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
  const expectedBytes = Number(replay.mp4_total_bytes || 0);

  const rescueCompletedObject = async (reason: string): Promise<Record<string, unknown> | null> => {
    if (!replay.r2_object_key) return null;
    const head = await headR2Object(replay.r2_object_key).catch(() => ({ exists: false, size: 0 }));
    if (!head.exists || head.size <= 0) return null;
    if (expectedBytes > 0 && head.size < expectedBytes) {
      throw new Error(`R2 object size mismatch after complete rescue: ${head.size}/${expectedBytes}`);
    }
    const r2Url = replay.r2_video_url || r2PublicUrlForKey(replay.r2_object_key);
    const playable = await verifyR2PlayableUrl(r2Url, 1024);
    if (!playable.ok) throw new Error(`R2 playable verification failed during complete rescue: ${playable.status}`);

    const now = new Date().toISOString();
    await patchReplay(admin, replay.id, {
      archive_status: ArchiveStep.ARCHIVED,
      archive_phase: Phase.POSTING,
      archived_at: replay.archived_at || now,
      r2_verified_at: now,
      replay_ready_at: replay.replay_ready_at || now,
      r2_video_url: r2Url,
      playback_mp4: r2Url,
      storage_provider: 'r2',
      playback_provider: 'r2',
      filesize_bytes: head.size,
      multipart_upload_id: null,
      expires_at: null,
      archive_error: null,
      error_message: null,
      archive_next_retry_at: null,
      archive_lease_until: null,
      last_cf_status: 'r2_complete_rescued',
      last_cf_response: { reason, rescued_at: now, size: head.size },
    });
    console.log('[ARCHIVE_VERIFY_RESCUE_OK]', { replay_id: replay.id, size: head.size, reason });
    return { ok: true, replay_id: replay.id, phase: Phase.POSTING, size: head.size, rescued_complete: true, reason };
  };

  const preCompleteRescue = await rescueCompletedObject('object_exists_before_complete');
  if (preCompleteRescue) return preCompleteRescue;

  if (!replay.multipart_upload_id || !replay.r2_object_key) {
    // Fast-path đã single-PUT xong rồi → bỏ qua complete
    await setPhase(admin, replay.id, Phase.POSTING);
    return { ok: true, replay_id: replay.id, phase: Phase.POSTING, skipped_complete: true };
  }
  const parts: UploadedPart[] = Array.isArray(replay.multipart_parts_done) ? replay.multipart_parts_done : [];
  const totalParts = Number(replay.multipart_total_parts);
  if (parts.length !== totalParts) {
    // Có thể DB ghi thiếu part nhưng R2 đã ghép xong từ lần complete trước → thử rescue
    const rescuedMissingParts = await rescueCompletedObject(`parts_missing_in_db_${parts.length}_of_${totalParts}`);
    if (rescuedMissingParts) return rescuedMissingParts;
    throw new Error(`Cannot complete: ${parts.length}/${totalParts} parts uploaded`);
  }
  let completed: { url: string; key: string; bucket: string };
  try {
    completed = await completeMultipartUpload({
      key: replay.r2_object_key,
      uploadId: replay.multipart_upload_id,
      parts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const canRescueComplete = /NoSuchUpload|InvalidUpload|InvalidPart|EntityTooSmall|already.*completed|timeout|timed out|network|fetch/i.test(message);
    if (canRescueComplete) {
      const rescued = await rescueCompletedObject(`complete_failed_${message.slice(0, 160)}`);
      if (rescued) return rescued;
    }
    throw error;
  }
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
  // Re-fetch để có URL R2 mới nhất
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
  // Safety guard: tuyệt đối không xoá Cloudflare Stream khi chưa có R2 URL đã verify
  if (!replay.r2_video_url) {
    throw new Error('Refuse to delete CF stream before R2 verified: missing r2_video_url');
  }
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
  const totalBytes = Number(replay.mp4_total_bytes || 0);
  const bytesDone = Number(replay.multipart_bytes_done || 0);
  const partsDone = Array.isArray(replay.multipart_parts_done) ? replay.multipart_parts_done.length : 0;
  const totalParts = Number(replay.multipart_total_parts || 0);
  if ((totalParts > 0 && partsDone >= totalParts) || (totalBytes > 0 && bytesDone >= totalBytes)) return false;

  const updatedMs = replay.updated_at ? Date.parse(String(replay.updated_at)) : 0;
  const lastProgressMs = Number.isFinite(updatedMs) ? updatedMs : 0;
  const stale = lastProgressMs > 0 && Date.now() - lastProgressMs >= STUCK_PART_SIZE_STALE_MS;
  const repeatedFailures = Number(replay.archive_attempts || 0) >= STUCK_PART_SIZE_FAIL_THRESHOLD;
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

  // SELF-HEAL: nếu R2 đã có file đầy đủ → finalize ngay (giữ nguyên path cũ)
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

  // Re-fetch sau lease để có state mới nhất
  const { data: fresh } = await (admin as any).from('live_replays').select('*').eq('id', replay.id).maybeSingle();
  let current = fresh || replay;

  if (await maybeRestartStuckLargeMultipart(admin, current)) {
    const { data: restarted } = await (admin as any).from('live_replays').select('*').eq('id', replay.id).maybeSingle();
    current = restarted || { ...current, archive_phase: Phase.MULTIPART_INIT };
  }

  // Khởi tạo phase nếu chưa có
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
        // Cron MP4 riêng vẫn chạy, nhưng archive cron cũng poll trực tiếp để self-heal
        // các replay dài bị miss job hoặc bị kẹt ở mp4_wait.
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

    // Race-check: nếu invocation song song đã hoàn tất → bỏ qua
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
      const reason = `Stream UID không còn trên Cloudflare (404). Không thể export MP4.`;
      await markUnrecoverable(admin, current, reason, 'stream_404');
      return { ok: false, status: 'unrecoverable', replay_id: current.id, error: message };
    }

    const mp4Pending = /MP4 not ready/i.test(message);
    const rateLimited = (anyErr as any)?.rateLimited === true || (anyErr as any)?.httpStatus === 429;
    const retryAfterSeconds = Number((anyErr as any)?.retryAfterSeconds) || undefined;
    await recordTransientFailure(admin, current, message, { quickRetry: mp4Pending, rateLimited, retryAfterSeconds });
    // GIỮ archive_phase để cron tick sau retry đúng phase. KHÔNG flip session sang failed nếu đang live.
    console.warn('[ARCHIVE_PHASE_FAILED]', { replay_id: current.id, phase, error: message, rateLimited });
    throw err;
  } finally {
    // Best-effort release nếu chưa release (RPC bypass schema cache)
    await patchReplay(admin, replayId, { archive_lease_until: null });
  }
}

// ============================================================
// MP4 POLLING (chạy bởi cron riêng — KHÔNG block archive cron)
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
    const anyErr = err as { httpStatus?: number; notFound?: boolean; rateLimited?: boolean; retryAfterSeconds?: number };
    const isPermanent404 = anyErr?.notFound === true || anyErr?.httpStatus === 404;
    const rateLimited = anyErr?.rateLimited === true || anyErr?.httpStatus === 429;
    if (rateLimited) {
      // 429: không tăng attempts, đẩy retry sang sau retryAfter
      const retryIso = new Date(Date.now() + Math.max(20, Math.min(120, anyErr?.retryAfterSeconds ?? 45)) * 1000).toISOString();
      await (admin as any).from('live_replays').update({
        archive_error: `rate_limited_429: ${message}`.slice(0, 1000),
        archive_next_retry_at: retryIso,
        last_error_at: new Date().toISOString(),
      }).eq('id', replayId);
      return { ok: true, status: 'rate_limited', replay_id: replayId, retry_after_seconds: anyErr?.retryAfterSeconds ?? 45 };
    }
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
