/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, createAdminClient, json } from '../_shared/httpAuth.ts';
import {
  copyR2Object,
  headR2ObjectInBucket,
  listR2Objects,
  publicArchiveUrl,
  publicTempUrl,
} from '../_shared/r2MultiBucketService.ts';
import { createOrUpdateReplayPost, createOrUpdateTempHlsReplayPost, upsertCreatorLibrary } from '../_shared/replayFeedService.ts';
import { queryRecording, stopRecording } from '../_shared/agoraCloudRecordingService.ts';
import { isPendingAgoraRecording } from '../_shared/agoraRecordingWebhookPolicy.ts';

const HLS_RETRY_MS = 15_000;
const MP4_RETRY_BASE_MS = 30_000;
// Giữ file HLS trên `r2livetemp` 24h sau khi archive MP4 đã verify OK.
// Lý do: tránh case viewer đang phát HLS thì bị đứt giữa chừng vì cleanup chạy quá sớm,
// và để FE có đủ thời gian đảo player sang MP4 vĩnh viễn. Storage tạm không đáng kể.
const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000;

class RetryableArchiveSourceNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableArchiveSourceNotReadyError';
  }
}

async function requireCronOrAdmin(req: Request) {
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('X-Cron-Secret') || req.headers.get('x-cron-secret');
  const admin = createAdminClient() as any;
  if (cronSecret && provided === cronSecret) return { ok: true as const, admin };

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')) || '';
  if (!authHeader && !cronSecret) return { ok: true as const, admin };
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const token = authHeader.slice('Bearer '.length).trim();
  if (token && token === anonKey) return { ok: true as const, admin };

  const client = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, admin };
}

function userIdOf(session: any): string | null {
  return session.host_user_id || session.owner_id || session.user_id || null;
}

function tempPrefixOf(session: any, userId: string): string {
  return (session.temp_object_key || `agora-temp/${userId}/${session.id}`).replace(/\/+$/, '');
}

function pickMainHls(files: Array<{ key: string; size: number }>): { key: string; size: number } | null {
  return files.find((file) => file.key.endsWith('.m3u8') && !file.key.endsWith('_0.m3u8'))
    || files.find((file) => file.key.endsWith('.m3u8'))
    || null;
}

function pickMp4(files: Array<{ key: string; size: number }>): { key: string; size: number } | null {
  return files
    .filter((file) => file.key.endsWith('.mp4'))
    .sort((a, b) => b.size - a.size)[0]
    || null;
}

function archiveKeyFor(userId: string, liveSessionId: string): string {
  return `replays/${userId}/${liveSessionId}/replay.mp4`;
}

function extractAgoraFileList(lastWorkerResponse: unknown): Array<{ key: string; size: number }> {
  try {
    const root = (lastWorkerResponse && typeof lastWorkerResponse === 'object') ? lastWorkerResponse as Record<string, any> : null;
    const server = root?.serverResponse;
    const fileList = server?.fileList;
    if (!Array.isArray(fileList)) return [];
    return fileList
      .map((entry: any) => {
        const key = typeof entry?.fileName === 'string' ? entry.fileName.replace(/^\/+/, '') : '';
        if (!key) return null;
        return { key, size: Number(entry?.size || 0) };
      })
      .filter((item: any): item is { key: string; size: number } => !!item);
  } catch {
    return [];
  }
}

function isValidMp4Head(head: { size: number; contentType?: string | null } | null): boolean {
  if (!head || Number(head.size || 0) <= 0) return false;
  const contentType = (head.contentType || '').toLowerCase();
  if (!contentType || contentType === 'application/octet-stream' || contentType === 'binary/octet-stream') return true;
  if (contentType.includes('video/')) return contentType.includes('mp4') || contentType.includes('mpeg4');
  return true;
}

function isValidTempObjectHead(head: { size: number; contentType?: string | null } | null): boolean {
  return !!head && Number(head.size || 0) > 0;
}

function isMissingSourceObjectError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('nosuchkey')
    || normalized.includes('r2 copy failed 404')
    || normalized.includes('r2 cross-account get failed 404');
}

async function verifyTempFile(
  admin: any,
  session: any,
  tempBucket: string,
  file: { key: string; size: number } | null,
  kind: 'hls' | 'mp4',
): Promise<{ key: string; size: number } | null> {
  if (!file) return null;
  const head = await headR2ObjectInBucket(tempBucket, file.key).catch((error) => {
    console.warn('[live-webcam-recording-processor] temp HEAD failed', session.id, file.key, error?.message || error);
    return null;
  });
  if (!isValidTempObjectHead(head)) {
    await logEvent(admin, session, 'temp_listing_fallback_agora_unverified', {
      temp_bucket: tempBucket,
      key: file.key,
      kind,
      agora_size: file.size,
      head_size: head?.size || 0,
    });
    return null;
  }
  return { key: file.key, size: Number(head?.size || file.size || 0) };
}

async function logEvent(admin: any, session: any, event: string, payload: Record<string, unknown> = {}) {
  const userId = userIdOf(session);
  await admin.from('live_session_events').insert({
    live_session_id: session.id,
    reason: event,
    source: 'live-webcam-recording-processor',
    payload: {
      live_session_id: session.id,
      user_id: userId,
      temp_bucket: session.temp_bucket || Deno.env.get('R2_TEMP_BUCKET') || null,
      temp_prefix: userId ? tempPrefixOf(session, userId) : null,
      archive_bucket: session.archive_bucket || Deno.env.get('R2_ARCHIVE_BUCKET') || null,
      ...payload,
      timestamp: new Date().toISOString(),
    },
  }).then(undefined, () => undefined);
}

async function keepTempHlsPostAfterArchiveFailure(admin: any, replay: any, hlsUrl: string, message: string) {
  const postId = replay.replay_post_id || null;
  if (!postId || !hlsUrl) return;
  const now = new Date().toISOString();
  const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
  const metadata = {
    ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
    live_status: 'ended',
    live_session_id: replay.live_session_id,
    replay_id: replay.id,
    replay_status: 'ready_hls',
    replay_ready: true,
    playback_url: hlsUrl,
    playback_hls: hlsUrl,
    playback_type: 'hls',
    playback_provider: 'r2_temp',
    storage_provider: 'r2_temp',
    archive_status: 'failed',
    archive_error: message,
    processing_message: 'Video dang xu ly lai. Ban van co the xem ban tam thoi.',
  };
  await admin.from('posts').update({
    video_url: hlsUrl,
    post_type: 'live_replay',
    replay_status: 'ready_hls',
    playback_provider: 'r2_temp',
    replay_ready: true,
    processing_message: metadata.processing_message,
    metadata,
    updated_at: now,
  }).eq('id', postId).then(undefined, () => undefined);
}

async function updateProcessing(admin: any, session: any, reason: string, nextDelayMs = HLS_RETRY_MS) {
  const now = new Date().toISOString();
  const retryCount = Number(session.archive_retry_count || 0) + 1;
  const retryDelayMs = Math.min(15 * 60_000, Math.max(nextDelayMs, 30_000 * (2 ** Math.min(retryCount - 1, 5))));
  await admin.from('live_sessions').update({
    status: session.recording_status === 'failed' ? 'failed' : 'processing_replay',
    recording_status: session.recording_status === 'failed' ? 'failed' : 'processing',
    archive_status: 'pending',
    archive_retry_count: retryCount,
    archive_next_retry_at: new Date(Date.now() + retryDelayMs).toISOString(),
    archive_error: reason,
    updated_at: now,
  }).eq('id', session.id);

  const postId = session.post_id || session.live_post_id || null;
  if (postId) {
    const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
    const metadata = {
      ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
      live_status: 'ended',
      live_session_id: session.id,
      replay_status: 'processing',
      playback_type: 'processing',
      processing_message: 'Đang xử lý video replay...',
    };
    await admin.from('posts').update({
      video_url: null,
      replay_status: 'processing',
      replay_ready: false,
      processing_message: 'Đang xử lý video replay...',
      metadata,
      updated_at: now,
    }).eq('id', postId).then(undefined, () => undefined);
  }

  await logEvent(admin, session, 'replay_processing', { reason });
}

async function upsertReplay(admin: any, session: any, payload: Record<string, unknown>) {
  const userId = userIdOf(session);
  if (!userId) throw new Error('Missing user id');
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('live_replays')
    .upsert({
      user_id: userId,
      live_session_id: session.id,
      chunked_recording_id: session.id,
      status: 'ready',
      storage_provider: 'r2',
      playback_provider: payload.playback_type === 'mp4' ? 'r2' : 'r2_temp',
      updated_at: now,
      ...payload,
    }, { onConflict: 'chunked_recording_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function ensureProcessingReplay(admin: any, session: any, input: {
  tempBucket: string;
  tempPrefix: string;
  mp4: { key: string; size: number };
  tempTotalSize: number;
}) {
  const now = new Date().toISOString();
  const userId = userIdOf(session);
  if (!userId) throw new Error('Missing user id');
  const { data, error } = await admin
    .from('live_replays')
    .upsert({
      user_id: userId,
      live_session_id: session.id,
      chunked_recording_id: session.id,
      status: 'processing',
      replay_status: 'processing',
      playback_type: 'processing',
      storage_provider: 'r2',
      playback_provider: 'r2',
      playback_hls: null,
      temp_hls_url: null,
      playback_mp4: null,
      r2_video_url: null,
      temp_bucket: input.tempBucket,
      temp_prefix: input.tempPrefix,
      temp_mp4_key: input.mp4.key,
      temp_total_size: input.tempTotalSize,
      archive_status: 'pending',
      cleanup_status: 'pending',
      error_message: null,
      updated_at: now,
    }, { onConflict: 'chunked_recording_id' })
    .select('*')
    .single();
  if (error) throw error;

  const postId = session.post_id || session.live_post_id || null;
  if (postId) {
    const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
    await admin.from('posts').update({
      video_url: null,
      replay_status: 'processing',
      replay_ready: false,
      processing_message: 'Video đang được xử lý',
      metadata: {
        ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
        live_status: 'ended',
        live_session_id: session.id,
        replay_id: data.id,
        replay_status: 'processing',
        replay_ready: false,
        playback_type: 'processing',
        playback_provider: 'r2',
        storage_provider: 'r2',
        processing_message: 'Video đang được xử lý',
      },
      updated_at: now,
    }).eq('id', postId).then(undefined, () => undefined);
  }

  await admin.from('live_sessions').update({
    status: 'processing_replay',
    recording_status: 'processing',
    archive_status: 'pending',
    temp_bucket: input.tempBucket,
    temp_object_key: input.tempPrefix,
    temp_path: input.mp4.key,
    playback_provider: 'r2',
    storage_provider: 'r2',
    archive_error: null,
    updated_at: now,
  }).eq('id', session.id);

  await logEvent(admin, session, 'replay_processing_mp4_found', {
    temp_bucket: input.tempBucket,
    temp_prefix: input.tempPrefix,
    mp4_key: input.mp4.key,
    file_size: input.mp4.size,
  });

  return data;
}

async function publishTempHls(admin: any, session: any, input: {
  tempBucket: string;
  tempPrefix: string;
  hls: { key: string; size: number };
  mp4: { key: string; size: number } | null;
  tsCount: number;
  tempTotalSize: number;
}) {
  const hlsUrl = publicTempUrl(input.hls.key);
  if (!hlsUrl) throw new Error('R2_TEMP_PUBLIC_BASE_URL is required to publish temp HLS');

  const now = new Date().toISOString();
  const replay = await upsertReplay(admin, session, {
    replay_status: 'ready_hls',
    playback_type: 'hls',
    playback_hls: hlsUrl,
    playback_mp4: null,
    temp_bucket: input.tempBucket,
    temp_prefix: input.tempPrefix,
    temp_hls_key: input.hls.key,
    temp_hls_url: hlsUrl,
    temp_mp4_key: input.mp4?.key || null,
    temp_total_size: input.tempTotalSize,
    hls_ready_at: now,
    archive_status: 'pending',
    cleanup_status: 'pending',
    error_message: null,
  });

  const replayPostId = await createOrUpdateTempHlsReplayPost(admin, replay, hlsUrl);
  if (!replayPostId) throw new Error('Temp HLS replay post not created');

  await admin.from('live_replays').update({
    replay_post_id: replayPostId,
    posted_at: replay.posted_at || now,
    auto_posted_at: replay.auto_posted_at || now,
    updated_at: now,
  }).eq('id', replay.id);

  await admin.from('live_sessions').update({
    status: 'ended',
    recording_status: 'stopped',
    archive_status: 'pending',
    archive_next_retry_at: input.mp4 ? now : new Date(Date.now() + HLS_RETRY_MS).toISOString(),
    temp_bucket: input.tempBucket,
    temp_object_key: input.tempPrefix,
    replay_url: hlsUrl,
    playback_url: hlsUrl,
    hls_url: hlsUrl,
    playback_provider: 'r2_temp',
    storage_provider: 'r2_temp',
    replay_post_id: replayPostId,
    archive_error: null,
    updated_at: now,
  }).eq('id', session.id);

  await logEvent(admin, session, 'replay_ready_hls', {
    temp_bucket: input.tempBucket,
    temp_prefix: input.tempPrefix,
    hls_key: input.hls.key,
    file_size: input.hls.size,
    ts_count: input.tsCount,
  });

  return { replay, replayPostId, hlsUrl };
}

async function archiveMp4(admin: any, session: any, replay: any, input: {
  tempBucket: string;
  tempPrefix: string;
  mp4: { key: string; size: number };
  archiveBucket: string;
}) {
  const userId = userIdOf(session);
  if (!userId) throw new Error('Missing user id');
  const archiveKey = archiveKeyFor(userId, session.id);
  const archiveUrl = publicArchiveUrl(archiveKey);
  if (!archiveUrl) throw new Error('R2_PUBLIC_BASE_URL is required to publish archive MP4');

  const now = new Date().toISOString();
  await admin.from('live_replays').update({
    replay_status: 'archiving',
    playback_type: 'hls',
    archive_status: 'archiving',
    archive_started_at: replay.archive_started_at || now,
    archive_bucket: input.archiveBucket,
    archive_mp4_key: archiveKey,
    temp_mp4_key: input.mp4.key,
    updated_at: now,
  }).eq('id', replay.id);
  await admin.from('live_sessions').update({
    archive_status: 'archiving',
    archive_bucket: input.archiveBucket,
    archive_object_key: archiveKey,
    updated_at: now,
  }).eq('id', session.id);

  let head = await headR2ObjectInBucket(input.archiveBucket, archiveKey).catch(() => null);
  if (!isValidMp4Head(head)) {
    const sourceHead = await headR2ObjectInBucket(input.tempBucket, input.mp4.key).catch((error) => {
      console.warn('[live-webcam-recording-processor] source MP4 HEAD failed', session.id, input.mp4.key, error?.message || error);
      return null;
    });
    if (!isValidMp4Head(sourceHead)) {
      await logEvent(admin, session, 'archive_source_mp4_not_ready', {
        temp_bucket: input.tempBucket,
        temp_prefix: input.tempPrefix,
        source_key: input.mp4.key,
        file_size: input.mp4.size,
        head_size: sourceHead?.size || 0,
      });
      throw new RetryableArchiveSourceNotReadyError(`Source MP4 not ready in temp bucket: ${input.mp4.key}`);
    }
    const sourceSize = Number(sourceHead.size || input.mp4.size || 0);

    // PRE-CHECK: HEAD source MP4 trên temp bucket trước khi COPY.
    // Tránh fail cứng `R2 COPY failed 404 NoSuchKey` khi Agora đã báo file nhưng
    // R2 chưa thấy (eventual consistency / Agora reuse cũ / file bị xoá sớm).
    await logEvent(admin, session, 'archive_copy_started', {
      temp_bucket: input.tempBucket,
      temp_prefix: input.tempPrefix,
      archive_bucket: input.archiveBucket,
      archive_key: archiveKey,
      source_key: input.mp4.key,
      file_size: sourceSize,
    });
    await copyR2Object({
      sourceBucket: input.tempBucket,
      sourceKey: input.mp4.key,
      targetBucket: input.archiveBucket,
      targetKey: archiveKey,
    });
    await logEvent(admin, session, 'archive_copy_completed', {
      archive_bucket: input.archiveBucket,
      archive_key: archiveKey,
      file_size: sourceSize,
    });
    head = await headR2ObjectInBucket(input.archiveBucket, archiveKey);
  }

  if (!isValidMp4Head(head)) {
    throw new Error(`Archive verification failed for ${archiveKey}`);
  }

  const completedAt = new Date().toISOString();
  const archiveSize = Number(head?.size || input.mp4.size || 0);
  const readyReplay = await upsertReplay(admin, session, {
    id: replay.id,
    replay_status: 'ready_mp4',
    playback_type: 'mp4',
    playback_hls: replay.temp_hls_url || replay.playback_hls || null,
    playback_mp4: archiveUrl,
    r2_bucket: input.archiveBucket,
    r2_object_key: archiveKey,
    r2_video_url: archiveUrl,
    r2_verified_at: completedAt,
    replay_ready_at: completedAt,
    archived_at: completedAt,
    archive_status: 'r2_ready',
    archive_bucket: input.archiveBucket,
    archive_mp4_key: archiveKey,
    archive_mp4_url: archiveUrl,
    archive_file_size: archiveSize,
    archive_completed_at: completedAt,
    cleanup_status: 'cleanup_pending',
    cleanup_next_retry_at: new Date(Date.now() + CLEANUP_DELAY_MS).toISOString(),
    error_message: null,
    filesize_bytes: archiveSize,
  });

  await logEvent(admin, session, 'archive_verified', {
    archive_bucket: input.archiveBucket,
    archive_key: archiveKey,
    file_size: archiveSize,
    content_type: head?.contentType || null,
  });

  const replayPostId = await createOrUpdateReplayPost(admin, readyReplay, archiveUrl);
  if (!replayPostId) throw new Error('Archive MP4 replay post not updated');
  await upsertCreatorLibrary(admin, { ...readyReplay, replay_post_id: replayPostId }, replayPostId).catch(() => undefined);

  await admin.from('live_replays').update({
    replay_post_id: replayPostId,
    posted_at: readyReplay.posted_at || completedAt,
    auto_posted_at: readyReplay.auto_posted_at || completedAt,
    updated_at: completedAt,
  }).eq('id', readyReplay.id);

  const { error: sessionSyncErr } = await admin.from('live_sessions').update({
    status: 'ended',
    ended_at: session.ended_at || completedAt,
    recording_status: 'ready',
    archive_status: 'r2_ready',
    archive_bucket: input.archiveBucket,
    archive_object_key: archiveKey,
    replay_url: archiveUrl,
    playback_url: archiveUrl,
    playback_provider: 'r2',
    storage_provider: 'r2',
    r2_bucket: input.archiveBucket,
    r2_object_key: archiveKey,
    r2_video_url: archiveUrl,
    replay_post_id: replayPostId,
    replay_ready_at: completedAt,
    r2_archived_at: completedAt,
    archive_error: null,
    archive_next_retry_at: null,
    updated_at: completedAt,
  }).eq('id', session.id);
  if (sessionSyncErr) {
    console.error('[live-webcam-recording-processor] live_sessions sync after archive failed', session.id, sessionSyncErr.message);
    await logEvent(admin, session, 'live_sessions_sync_failed', { error: sessionSyncErr.message });
  }

  await logEvent(admin, session, 'replay_switched_to_mp4', {
    archive_bucket: input.archiveBucket,
    archive_key: archiveKey,
    file_size: archiveSize,
  });

  return { replay: readyReplay, replayPostId, archiveUrl };
}

async function processSession(admin: any, session: any): Promise<Record<string, unknown>> {
  const userId = userIdOf(session);
  const tempBucket = session.temp_bucket || Deno.env.get('R2_TEMP_BUCKET') || 'r2livetemp';
  const archiveBucket = session.archive_bucket || Deno.env.get('R2_ARCHIVE_BUCKET');
  if (!userId || !tempBucket || !archiveBucket) throw new Error('Missing userId/tempBucket/archiveBucket');
  const tempPrefix = tempPrefixOf(session, userId);

  // EARLY-RETURN GUARD: nếu replay đã ready (live_replays.status='ready' + có playback_mp4 + post),
  // chỉ đồng bộ live_sessions.row về trạng thái 'ended/r2_ready' và thoát.
  // Tránh re-archive vô tận (root cause khiến session "kẹt" archive_status=archiving + ended_at=NULL).
  try {
    const { data: existingReplay } = await admin
      .from('live_replays')
      .select('id, status, replay_status, playback_mp4, r2_video_url, r2_object_key, r2_bucket, replay_post_id, archived_at, replay_ready_at')
      .eq('live_session_id', session.id)
      .maybeSingle();
    const replayReady = existingReplay
      && existingReplay.status === 'ready'
      && existingReplay.replay_status === 'ready_mp4'
      && (existingReplay.playback_mp4 || existingReplay.r2_video_url)
      && existingReplay.replay_post_id;
    if (replayReady) {
      const archiveUrl = existingReplay.playback_mp4 || existingReplay.r2_video_url;
      const completedAt = existingReplay.replay_ready_at || existingReplay.archived_at || new Date().toISOString();
      const needSync = session.status !== 'ended'
        || !session.ended_at
        || session.archive_status !== 'r2_ready'
        || session.recording_status !== 'ready'
        || session.replay_post_id !== existingReplay.replay_post_id;
      if (needSync) {
        const { error: syncErr } = await admin.from('live_sessions').update({
          status: 'ended',
          ended_at: session.ended_at || completedAt,
          recording_status: 'ready',
          archive_status: 'r2_ready',
          archive_next_retry_at: null,
          archive_error: null,
          archive_bucket: existingReplay.r2_bucket || session.archive_bucket,
          archive_object_key: existingReplay.r2_object_key || session.archive_object_key,
          replay_url: archiveUrl,
          playback_url: archiveUrl,
          playback_provider: 'r2',
          storage_provider: 'r2',
          r2_bucket: existingReplay.r2_bucket || session.r2_bucket,
          r2_object_key: existingReplay.r2_object_key || session.r2_object_key,
          r2_video_url: archiveUrl,
          replay_post_id: existingReplay.replay_post_id,
          replay_ready_at: session.replay_ready_at || completedAt,
          r2_archived_at: session.r2_archived_at || completedAt,
          updated_at: new Date().toISOString(),
        }).eq('id', session.id);
        if (syncErr) {
          console.error('[live-webcam-recording-processor] early-return sync update failed', session.id, syncErr.message);
          await logEvent(admin, session, 'replay_sync_update_failed', { error: syncErr.message });
        } else {
          await logEvent(admin, session, 'replay_already_ready_synced', {
            replay_id: existingReplay.id,
            replay_post_id: existingReplay.replay_post_id,
            archive_url: archiveUrl,
          });
        }
      }
      return { id: session.id, status: 'already_ready', replay_post_id: existingReplay.replay_post_id, synced: needSync };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[live-webcam-recording-processor] early-return guard failed', session.id, msg);
    await logEvent(admin, session, 'early_return_guard_failed', { error: msg }).catch(() => undefined);
  }

  const resourceId = session.recording_resource_id || session.resource_id;
  const sid = session.recording_sid || session.sid;
  const channel = session.agora_channel_name || session.agora_channel || session.channel_name;
  const uid = session.recording_uid || session.agora_uid_recording || session.recording_agora_uid;
  const liveEnded = session.status === 'ended' || session.status === 'recording_processing' || Boolean(session.ended_at);
  const recordingStopped = ['stopped', 'ready', 'failed'].includes(String(session.recording_status || ''));

  if (!liveEnded && !recordingStopped) {
    return { id: session.id, status: 'waiting_for_live_end' };
  }

  if (resourceId && sid && channel && uid && session.recording_status === 'recording') {
    await stopRecording(resourceId, sid, channel, uid).catch((error) => {
      console.warn('[live-webcam-recording-processor] stop failed', session.id, error?.message || error);
    });
    await admin.from('live_sessions').update({
      recording_status: 'stopped',
      recording_stopped_at: new Date().toISOString(),
      status: 'ended',
      ended_at: session.ended_at || new Date().toISOString(),
      archive_status: 'pending',
      archive_next_retry_at: new Date().toISOString(),
      archive_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', session.id);
    await logEvent(admin, session, 'recording_stopped', { reason: 'processor_stop_recording' });
  } else if (resourceId && sid && channel && uid && session.recording_status === 'stopping') {
    await queryRecording(resourceId, sid, channel, uid).then((response) => admin.from('live_sessions').update({
      recording_last_query_at: new Date().toISOString(),
      last_worker_response: response,
    }).eq('id', session.id), () => undefined);
  } else {
    await logEvent(admin, session, 'recording_stopped', { reason: 'already_stopped', recording_status: session.recording_status });
  }

  // B5-A′: KHÔNG ghi `temp_scan_started` (chạy mỗi phút cho mỗi phiên đang xử lý).
  // Kết quả thật vẫn được ghi ở các event sau (recording_stopped / replay_processing).


  let tempObjects: Array<{ key: string; size: number }> = [];
  let listError: string | null = null;
  try {
    tempObjects = (await listR2Objects(tempBucket, tempPrefix, 5000)).filter((file) => file.size > 0);
  } catch (error) {
    listError = error instanceof Error ? error.message : String(error);
    console.warn('[live-webcam-recording-processor] listR2Objects failed', session.id, listError);
  }

  let hls = pickMainHls(tempObjects);
  let mp4 = pickMp4(tempObjects);
  let tsCount = tempObjects.filter((file) => file.key.endsWith('.ts')).length;
  let tempTotalSize = tempObjects.reduce((sum, item) => sum + Number(item.size || 0), 0);
  let usedAgoraFallback = false;
  let sawAgoraFallbackFiles = false;

  // Fallback: Agora's fileList is only a manifest. Verify each candidate with
  // R2 HEAD before publishing a temp URL or attempting archive copy.
  // Fallback: nếu R2 LIST không trả về file (do quyền/eventual-consistency) nhưng
  // Agora đã báo `fileList` trong `last_worker_response`, ta KIỂM TRA THẬT từng key
  // bằng HEAD trên `r2livetemp` trước khi tin. Nếu HEAD 404 (Agora báo nhưng file
  // chưa thực sự up xong/đã bị xoá), giữ session ở trạng thái pending để retry,
  // tránh publish link `temp.fun.rich` lỗi hoặc copy MP4 NoSuchKey.
  if (!hls) {
    const fileList = extractAgoraFileList(session.last_worker_response);
    sawAgoraFallbackFiles = fileList.length > 0;
    if (fileList.length) {
      const hlsEntry = fileList.find((f) => f.key.endsWith('.m3u8') && !f.key.endsWith('_0.m3u8'))
        || fileList.find((f) => f.key.endsWith('.m3u8'));
      const mp4Entry = fileList
        .filter((f) => f.key.endsWith('.mp4'))
        .sort((a, b) => b.size - a.size)[0] || null;
      const verifiedHls = await verifyTempFile(admin, session, tempBucket, hlsEntry || null, 'hls');
      if (verifiedHls) {
        hls = verifiedHls;
        const verifiedMp4 = !mp4 ? await verifyTempFile(admin, session, tempBucket, mp4Entry, 'mp4') : null;
        if (!mp4 && verifiedMp4) mp4 = verifiedMp4;
        tsCount = 0;
        tempTotalSize = Math.max(tempTotalSize, hls.size + (mp4?.size || 0));
        usedAgoraFallback = true;
        await logEvent(admin, session, 'temp_listing_fallback_agora', {
          temp_bucket: tempBucket,
          temp_prefix: tempPrefix,
          list_error: listError,
          hls_key: hls.key,
          mp4_key: mp4?.key || null,
          verified_via_head: true,
        });
      }
    }
  }

  if (hls) {
    await logEvent(admin, session, 'hls_found', {
      temp_bucket: tempBucket,
      temp_prefix: tempPrefix,
      hls_key: hls.key,
      file_size: hls.size,
      ts_count: tsCount,
      source: usedAgoraFallback ? 'agora_filelist' : 'r2_list',
    });
  }
  if (mp4) {
    await logEvent(admin, session, 'mp4_found', {
      temp_bucket: tempBucket,
      temp_prefix: tempPrefix,
      mp4_key: mp4.key,
      file_size: mp4.size,
      source: usedAgoraFallback ? 'agora_filelist' : 'r2_list',
    });
  }

  if (!mp4) {
    const reason = sawAgoraFallbackFiles ? 'agora_filelist_unverified' : (tempObjects.length ? 'mp4_not_ready' : 'temp_empty');
    await updateProcessing(admin, session, reason, HLS_RETRY_MS);
    return { id: session.id, status: 'processing', seen: tempObjects.length, list_error: listError, reason };
  }

  const replay = await ensureProcessingReplay(admin, session, {
    tempBucket,
    tempPrefix,
    mp4,
    tempTotalSize,
  });

  try {
    const archived = await archiveMp4(admin, session, replay, { tempBucket, tempPrefix, mp4, archiveBucket });
    return { id: session.id, status: 'ready_mp4', replay_url: archived.archiveUrl, post_id: archived.replayPostId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const sourceNotReady = error instanceof RetryableArchiveSourceNotReadyError || isMissingSourceObjectError(message);
    const retryCount = Number(session.archive_retry_count || replay.retry_count || 0) + 1;
    const nextDelayMs = Math.min(60 * 60_000, MP4_RETRY_BASE_MS * (2 ** Math.min(retryCount - 1, 7)));
    await admin.from('live_replays').update({
      replay_status: 'processing',
      playback_type: 'processing',
      playback_hls: null,
      temp_hls_url: null,
      playback_provider: 'r2',
      storage_provider: 'r2',
      archive_status: 'pending',
      error_message: message,
      retry_count: retryCount,
      archive_next_retry_at: new Date(Date.now() + nextDelayMs).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', replay.id).then(undefined, () => undefined);
    await admin.from('live_sessions').update({
      archive_status: 'pending',
      recording_status: 'processing',
      status: 'processing_replay',
      archive_retry_count: retryCount,
      archive_next_retry_at: new Date(Date.now() + nextDelayMs).toISOString(),
      archive_error: message,
      updated_at: new Date().toISOString(),
    }).eq('id', session.id).then(undefined, () => undefined);
    await logEvent(admin, session, 'archive_retry_scheduled', {
      reason: message,
      error: message,
      retry_count: retryCount,
      source_not_ready: sourceNotReady,
      retry_delay_ms: nextDelayMs,
      temp_bucket: tempBucket,
      temp_prefix: tempPrefix,
      archive_bucket: archiveBucket,
      archive_key: archiveKeyFor(userId, session.id),
      file_size: mp4.size,
    });
    return { id: session.id, status: 'archive_retry', error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const guard = await requireCronOrAdmin(req);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin as any;

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(25, Number(body.limit || 5)));
    const nowIso = new Date().toISOString();
    const archiveStates = ['pending', 'failed', 'archiving'];
    let query = admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'agora_webcam')
      .not('recording_sid', 'is', null)
      .is('deleted_at', null)
      // 'processing' included so sessions stuck mid-process (orphaned by a previous run crash)
      // are retried by the regular cron instead of being silently left behind.
      .in('recording_status', ['stopped', 'ready', 'failed', 'recording', 'processing'])
      .or(`archive_status.is.null,archive_status.in.(${archiveStates.join(',')})`);

    if (typeof body.session_id === 'string' && body.session_id.trim()) {
      query = query.eq('id', body.session_id.trim());
    } else {
      query = query.or(`archive_next_retry_at.is.null,archive_next_retry_at.lte.${nowIso}`)
        .order('archive_retry_count', { ascending: true })
        .order('archive_next_retry_at', { ascending: true, nullsFirst: true })
        .limit(limit);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];
    for (const session of rows || []) {
      if (!isPendingAgoraRecording(session)) {
        results.push({ id: session.id, status: 'skip_not_pending' });
        continue;
      }
      try {
        results.push(await processSession(admin, session));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[live-webcam-recording-processor] session error', session.id, message);
        const retryCount = Number(session.archive_retry_count || 0) + 1;
        const nextDelayMs = Math.min(60 * 60_000, 60_000 * (2 ** Math.min(retryCount - 1, 6)));
        await admin.from('live_sessions').update({
          archive_status: 'pending',
          archive_retry_count: retryCount,
          archive_next_retry_at: new Date(Date.now() + nextDelayMs).toISOString(),
          error_message: message,
          archive_error: message,
          updated_at: new Date().toISOString(),
        }).eq('id', session.id).then(undefined, () => undefined);
        await logEvent(admin, session, 'archive_retry_scheduled', { reason: message, retry_count: retryCount, retry_delay_ms: nextDelayMs });
        results.push({ id: session.id, status: 'pending_retry', error: message });
      }
    }

    return json({ ok: true, scanned: rows?.length || 0, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[live-webcam-recording-processor] fatal', message);
    return json({ error: message }, 500);
  }
});
