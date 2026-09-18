import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/utils/r2Upload';
import { toJson, mergeJson } from '@/utils/supabaseJsonHelpers';
import logger from '@/lib/logger';
import type { CreateLiveSessionInput, LiveEndReason, LiveSession, LivePrivacy, LiveStatus } from './types';
import type { Database } from '@/integrations/supabase/types';

type LiveSessionRow = Database['public']['Tables']['live_sessions']['Row'];
type LiveSessionInsert = Database['public']['Tables']['live_sessions']['Insert'];
type PostInsert = Database['public']['Tables']['posts']['Insert'];

export type LiveReplayStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'failed' | 'skipped_legacy';

export interface WebcamLiveStartInput {
  title?: string;
  description?: string;
  privacy?: LivePrivacy;
  quality?: string;
  audioMode?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  viewportOrientation?: 'landscape' | 'portrait';
  recordingAspectRatio?: 'landscape_16_9' | 'portrait_9_16';
  /** Kích thước thật của camera track (qua MediaStreamTrack.getSettings) */
  cameraWidth?: number;
  cameraHeight?: number;
  cameraOrientation?: 'landscape' | 'portrait';
}

export interface WebcamLiveStartResult {
  sessionId: string;
  channel: string;
  token: string;
  uid: number;
  appId: string;
  expiresAt: number;
  recordingAvailable?: boolean;
  recordingStartQueued?: boolean;
  fallbackRecordingRecommended?: boolean;
  fallbackProvider?: 'browser';
  recordingErrorCode?: string;
  recording?: {
    resourceId?: string;
    sid?: string;
    uid?: number;
  };
}

export interface WebcamRecordingEnsureResult {
  ok: boolean;
  skipped?: boolean;
  status?: string | null;
  resourceId?: string | null;
  sid?: string | null;
  errorCode?: string;
  errorMessage?: string;
}

export interface WebcamLiveStatusResult {
  status: 'live' | 'stopping' | 'processing' | 'ready' | 'failed';
  raw_status?: string | null;
  recording_status?: string | null;
  replay_url?: string | null;
  thumbnail_url?: string | null;
  duration?: number | null;
  error_message?: string | null;
}

/**
 * Báo Feed React Query refetch ngay sau khi luồng live tạo/thay đổi post.
 * Bù cho việc useFeedPosts chỉ realtime trên gift_celebration; không thì
 * trên mobile (cùng tab) feed sẽ giữ snapshot cũ, user không thấy bài live/replay.
 */
function dispatchFeedInvalidation(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event('invalidate-feed'));
  } catch (err) {
    logger.warn('[liveService] dispatchFeedInvalidation failed:', err);
  }
}

export interface LiveReplayRow {
  id: string;
  user_id: string;
  live_session_id: string;
  chunked_recording_id: string | null;
  source_webm_key: string | null;
  stream_uid: string | null;
  playback_hls: string | null;
  playback_dash: string | null;
  playback_mp4: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  filesize_bytes: number | null;
  status: LiveReplayStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveReplayUploadSession {
  uploadURL: string;
  stream_uid: string | null;
  replay_id: string;
}

export interface LiveRouteResolution {
  live_session_id: string;
  status?: string | null;
  post_id?: string | null;
  live_post_id?: string | null;
  replay_post_id?: string | null;
  playback_url?: string | null;
  r2_video_url?: string | null;
  archive_url?: string | null;
  replay_url?: string | null;
  recording_status?: string | null;
  archive_status?: string | null;
  host_connection_status?: string | null;
  last_seen_at?: string | null;
  last_host_heartbeat_at?: string | null;
  ended_at?: string | null;
  end_reason?: string | null;
}

const LIVE_POST_DEFAULT_CONTENT = 'Đang LIVE trên FUN Profile';

const buildChannelName = (userId: string) => `live_${userId}_${Date.now()}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomSlugSuffix(): string {
  try {
    const bytes = new Uint8Array(4);
    globalThis.crypto?.getRandomValues(bytes);
    const value = Array.from(bytes).map((byte) => byte.toString(36)).join('');
    if (value) return value.slice(0, 8);
  } catch {
    // Fall back below for older browsers or restricted contexts.
  }
  return Math.random().toString(36).slice(2, 10);
}

function buildLivePostSlug(attempt = 0): string {
  const timestamp = Date.now().toString(36);
  const suffix = randomSlugSuffix();
  return `live_${timestamp}_${suffix}${attempt > 0 ? `_${attempt + 1}` : ''}`.slice(0, 80);
}

function isPostSlugConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  const raw = [
    err.code,
    err.message,
    err.details,
    err.hint,
    error instanceof Error ? error.message : '',
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return (
    raw.includes('23505') ||
    raw.includes('duplicate key') ||
    raw.includes('idx_posts_user_slug') ||
    raw.includes('posts_user_slug')
  );
}

async function createLivePostWithUniqueSlug(input: Omit<PostInsert, 'slug'>): Promise<{ id: string }> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = buildLivePostSlug(attempt);
    const { data: post, error } = await supabase
      .from('posts')
      .insert({ ...input, slug })
      .select('id')
      .single();

    if (!error && post?.id) return post;

    lastError = error;
    if (!isPostSlugConflict(error)) throw error;
    logger.warn('[liveService] live post slug conflict; retrying with a fresh slug', {
      attempt: attempt + 1,
      slug,
      error,
    });
  }

  throw lastError instanceof Error ? lastError : new Error('LIVE_POST_SLUG_CONFLICT');
}

export async function startWebcamLiveSessionBackend(input: WebcamLiveStartInput): Promise<WebcamLiveStartResult> {
  const { data, error } = await supabase.functions.invoke<WebcamLiveStartResult>('live-webcam-start', {
    body: input,
  });
  if (error) {
    const context = (error as { context?: unknown })?.context;
    if (context instanceof Response) {
      const status = context.status;
      const statusText = context.statusText;
      const rawBody = await context.clone().text().catch(() => '');
      const body = rawBody
        ? (() => {
            try {
              return JSON.parse(rawBody) as { error?: string; message?: string; code?: string };
            } catch {
              return null;
            }
          })()
        : null;
      if (body?.error || body?.message || body?.code) {
        const err = new Error([body.code, body.error || body.message, `HTTP_${status}`].filter(Boolean).join(': '));
        (err as Error & { code?: string }).code = body.code;
        (err as Error & { status?: number; responseBody?: string }).status = status;
        (err as Error & { status?: number; responseBody?: string }).responseBody = rawBody;
        throw err;
      }
      const err = new Error([`HTTP_${status}`, statusText, rawBody].filter(Boolean).join(': '));
      (err as Error & { status?: number; responseBody?: string }).status = status;
      (err as Error & { status?: number; responseBody?: string }).responseBody = rawBody;
      throw err;
    }
    throw error;
  }
  if (!data?.sessionId || !data.channel || !data.token) {
    throw new Error('LIVE_WEBCAM_START_INVALID_RESPONSE');
  }
  dispatchFeedInvalidation();
  return data;
}

export async function ensureWebcamLiveRecordingStarted(liveSessionId: string): Promise<WebcamRecordingEnsureResult> {
  const { data, error } = await supabase.functions.invoke<WebcamRecordingEnsureResult>('live-webcam-recording-ensure', {
    body: { live_session_id: liveSessionId },
  });
  if (error) {
    const context = (error as { context?: unknown })?.context;
    if (context instanceof Response) {
      const status = context.status;
      const statusText = context.statusText;
      const rawBody = await context.clone().text().catch(() => '');
      const body = rawBody
        ? (() => {
            try {
              return JSON.parse(rawBody) as { error?: string; message?: string; code?: string };
            } catch {
              return null;
            }
          })()
        : null;
      if (body?.error || body?.message || body?.code) {
        const err = new Error([body.code, body.error || body.message, `HTTP_${status}`].filter(Boolean).join(': '));
        (err as Error & { code?: string }).code = body.code;
        (err as Error & { status?: number; responseBody?: string }).status = status;
        (err as Error & { status?: number; responseBody?: string }).responseBody = rawBody;
        throw err;
      }
      const err = new Error([`HTTP_${status}`, statusText, rawBody].filter(Boolean).join(': '));
      (err as Error & { status?: number; responseBody?: string }).status = status;
      (err as Error & { status?: number; responseBody?: string }).responseBody = rawBody;
      throw err;
    }
    throw error;
  }
  return data ?? { ok: false, errorMessage: 'LIVE_WEBCAM_RECORDING_ENSURE_EMPTY_RESPONSE' };
}

export async function stopWebcamLiveSessionBackend(
  liveSessionId: string,
  reason?: string,
): Promise<{ ok: boolean; status?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; status?: string }>('live-webcam-stop', {
    body: { live_session_id: liveSessionId, reason },
  });
  if (error) throw error;
  dispatchFeedInvalidation();
  return data ?? { ok: true };
}

export async function getWebcamLiveStatus(liveSessionId: string): Promise<WebcamLiveStatusResult> {
  const MAX_ATTEMPTS = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.functions.invoke<WebcamLiveStatusResult>('live-webcam-status', {
      body: { live_session_id: liveSessionId },
    });

    if (!error) {
      if (!data?.status) throw new Error('LIVE_WEBCAM_STATUS_INVALID_RESPONSE');
      return data;
    }

    const msg = (error as { message?: string })?.message || '';
    const status = (error as { context?: { status?: number } })?.context?.status;

    // Session không tồn tại (404) — trả về failed để caller ngừng poll, không throw runtime error.
    if (status === 404 || /404|SESSION_NOT_FOUND|not found/i.test(msg)) {
      return { ok: false, status: 'failed', error_message: 'SESSION_NOT_FOUND' } as WebcamLiveStatusResult;
    }

    // Lỗi hạ tầng tạm thời (edge runtime degraded / 5xx / mất mạng) — retry rồi bỏ qua.
    const isTransient =
      (typeof status === 'number' && status >= 500) ||
      /SERVICE_DEGRADED|temporarily unavailable|503|502|504|Failed to fetch|NetworkError/i.test(msg);

    if (!isTransient) throw error;

    lastError = error;
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }

  // Không throw để tránh crash màn hình live: giữ trạng thái 'live' cho vòng poll kế tiếp.
  console.warn('[live-webcam-status] tạm thời không truy vấn được, sẽ thử lại ở vòng poll sau', lastError);
  return { status: 'live', error_message: 'STATUS_TEMPORARILY_UNAVAILABLE' } as WebcamLiveStatusResult;
}

export async function uploadBrowserRecordingChunk(input: {
  liveSessionId: string;
  postId?: string | null;
  chunkIndex: number;
  blob: Blob;
  mimeType: string;
  durationMs?: number | null;
}): Promise<{ success: boolean; r2_key: string; r2_bucket: string; size_bytes: number; chunk_index: number }> {
  const formData = new FormData();
  formData.append('file', input.blob, `chunk-${String(input.chunkIndex).padStart(6, '0')}.${input.mimeType.includes('mp4') ? 'mp4' : 'webm'}`);
  formData.append('live_session_id', input.liveSessionId);
  if (input.postId) formData.append('post_id', input.postId);
  formData.append('chunk_index', String(input.chunkIndex));
  formData.append('mime_type', input.mimeType || input.blob.type || 'video/webm');
  if (input.durationMs != null) formData.append('duration_ms', String(Math.max(0, Math.round(input.durationMs))));

  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    r2_key: string;
    r2_bucket: string;
    size_bytes: number;
    chunk_index: number;
  }>('live-browser-recording-upload', {
    body: formData,
  });
  if (error) throw error;
  if (!data?.success) throw new Error('BROWSER_RECORDING_UPLOAD_INVALID_RESPONSE');
  return data;
}

export async function markBrowserRecordingFallbackFinished(
  liveSessionId: string,
  status: 'uploaded' | 'failed',
  warning?: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('live-browser-recording-upload', {
    body: {
      action: status === 'uploaded' ? 'finalize' : 'fail',
      live_session_id: liveSessionId,
      warning,
    },
  });
  if (error) throw error;
}

export async function markBrowserRecordingFallbackStarted(
  liveSessionId: string,
  warning?: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('live-browser-recording-upload', {
    body: {
      action: 'start',
      live_session_id: liveSessionId,
      warning,
    },
  });
  if (error) throw error;
}

const uuidToNumericUid = (uuid: string) => {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) || 10001;
};

interface UploadLiveRecordingResult {
  key: string;
  url: string;
}

export type RecordingStatus =
  | 'idle'
  | 'acquiring'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'compressing'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'stopped';

export interface FinalizeLiveSessionOptions {
  playbackUrl?: string | null;
  recordingStatus?: RecordingStatus;
  endReason?: LiveEndReason;
}

export interface MarkLiveSessionFailedOptions {
  endReason?: LiveEndReason;
  errorCode?: string | null;
  errorMessageInternal?: string | null;
}

type LivePostMetadata = {
  live_title?: string | null;
  live_status?: 'live' | 'ended';
  channel_name?: string | null;
  agora_channel?: string | null;
  live_session_id?: string | null;
  viewer_count?: number;
  ended_at?: string | null;
  started_at?: string | null;
  playback_url?: string | null;
  [key: string]: unknown;
};

async function mergeLivePostMetadata(postId: string, patch: Partial<LivePostMetadata>): Promise<void> {
  const { data: existingPost } = await supabase
    .from('posts')
    .select('metadata')
    .eq('id', postId)
    .maybeSingle();

  const merged = mergeJson<LivePostMetadata>(existingPost?.metadata ?? null, patch);

  await supabase
    .from('posts')
    .update({ metadata: merged })
    .eq('id', postId);
}

/** Typed row from live_sessions query with joined profile */
interface LiveSessionQueryRow extends Omit<LiveSessionRow, 'last_worker_response' | 'recording_files'> {
  host_profile?: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

function normalizeLiveSession(row: LiveSessionQueryRow): LiveSession {
  return {
    id: row.id,
    host_user_id: row.host_user_id || row.owner_id,
    user_id: row.user_id ?? row.owner_id ?? row.host_user_id,
    mode: (row.mode as LiveSession['mode']) || 'agora_webcam',
    agora_channel: row.agora_channel || row.channel_name,
    agora_channel_name: row.agora_channel_name || row.agora_channel || row.channel_name,
    channel_name: row.channel_name,
    agora_uid_host: row.agora_uid_host ?? null,
    agora_uid: row.agora_uid ?? row.agora_uid_host ?? null,
    recording_uid: row.recording_uid ?? null,
    recording_status: (row.recording_status as LiveSession['recording_status']) ?? null,
    recording_provider: row.recording_provider ?? null,
    recording_error_code: row.recording_error_code ?? null,
    recording_error_message: row.recording_error_message ?? null,
    browser_recording_status: row.browser_recording_status ?? null,
    browser_recording_warning: row.browser_recording_warning ?? null,
    browser_recording_chunk_count: row.browser_recording_chunk_count ?? 0,
    browser_recording_total_bytes: row.browser_recording_total_bytes ?? 0,
    title: row.title ?? null,
    description: row.description ?? null,
    privacy: row.privacy as LivePrivacy,
    status: row.status as LiveStatus,
    cloudflare_live_input_id: row.cloudflare_live_input_id ?? null,
    cloudflare_video_uid: row.cloudflare_video_uid ?? null,
    rtmps_url: row.rtmps_url ?? null,
    stream_key_last_reset_at: row.stream_key_last_reset_at ?? null,
    source_connected_at: row.source_connected_at ?? null,
    go_live_clicked_at: row.go_live_clicked_at ?? null,
    playback_url: row.playback_url ?? null,
    hls_url: row.hls_url ?? null,
    r2_video_url: row.r2_video_url ?? null,
    playback_provider: row.playback_provider ?? null,
    storage_provider: row.storage_provider ?? null,
    archive_status: row.archive_status ?? null,
    archive_error: row.archive_error ?? null,
    live_post_id: row.live_post_id ?? null,
    replay_post_id: row.replay_post_id ?? null,
    viewer_count: row.viewer_count ?? 0,
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    last_seen_at: row.last_seen_at ?? null,
    last_host_heartbeat_at: row.last_host_heartbeat_at ?? null,
    host_connection_status: row.host_connection_status ?? null,
    end_reason: row.end_reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    post_id: row.post_id ?? null,
    host_profile: row.host_profile
      ? {
          username: row.host_profile.username ?? null,
          full_name: row.host_profile.full_name ?? null,
          avatar_url: row.host_profile.avatar_url ?? null,
        }
      : null,
  };
}

export async function uploadLiveThumbnail(
  thumbnailBlob: Blob,
  liveSessionId: string
): Promise<string | null> {
  try {
    const path = `live/${liveSessionId}/thumbnail.jpg`;
    const { error } = await supabase.storage
      .from('live-thumbnails')
      .upload(path, thumbnailBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) {
      logger.warn('[liveService] uploadLiveThumbnail error:', error);
      return null;
    }
    const { data } = supabase.storage.from('live-thumbnails').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    logger.warn('[liveService] uploadLiveThumbnail exception:', err);
    return null;
  }
}

export async function attachLiveReplayToPost(
  sessionId: string,
  playbackUrl: string,
  durationSeconds?: number,
  thumbnailUrl?: string | null
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.rpc('attach_live_replay_to_post' as any, {
    _session_id: sessionId,
    _playback_url: playbackUrl,
    _duration_seconds: durationSeconds,
    _thumbnail_url: thumbnailUrl,
  });
  if (error) throw error;
}

export async function createLiveSession(input: CreateLiveSessionInput): Promise<LiveSession> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error('Bạn cần đăng nhập để bắt đầu live');
  }

  const userId = session.user.id;
  const hostUid = uuidToNumericUid(userId);
  const title = (input.title?.trim() || '').slice(0, 5000);
  const channelName = buildChannelName(userId);
  const visibility = input.privacy === 'friends' ? 'friends' : 'public';

  // Single Active Host Rule (Facebook-style)
  // Gộp SELECT + UPDATE th�nh 1 UPDATE ... RETURNING để tiết kiệm round-trip.
  const nowIso = new Date().toISOString();
  const { data: oldSessions } = await supabase
    .from('live_sessions')
    .update({
      status: 'ended',
      ended_at: nowIso,
      end_reason: 'superseded_by_new_live',
      updated_at: nowIso,
    })
    .eq('host_user_id', userId)
    .eq('status', 'live')
    .select('id, post_id');

  if (oldSessions && oldSessions.length > 0) {
    // Cập nhật metadata c�c post cũ song song (kh�ng chặn tạo session mới).
    Promise.all(
      oldSessions
        .filter((o) => o.post_id)
        .map((o) =>
          mergeLivePostMetadata(o.post_id as string, { live_status: 'ended', ended_at: nowIso, live_session_id: o.id }).catch(
            (err) => logger.warn('[liveService] mergeLivePostMetadata old session failed:', err)
          )
        )
    );
  }

  let postId: string | null = null;

  const liveMetadata: LivePostMetadata = {
    live_title: title,
    live_status: 'live',
    live_mode: 'agora_webcam',
    channel_name: channelName,
    agora_channel: channelName,
    viewer_count: 0,
    started_at: nowIso,
  };

  try {
    const post = await createLivePostWithUniqueSlug({
      user_id: userId,
      content: title || LIVE_POST_DEFAULT_CONTENT,
      visibility,
      post_type: 'live',
      metadata: toJson(liveMetadata),
    });
    postId = post.id;

    const { data, error } = await supabase
      .from('live_sessions')
      .insert({
        host_user_id: userId,
        owner_id: userId,
        user_id: userId,
        channel_name: channelName,
        agora_channel: channelName,
        agora_channel_name: channelName,
        agora_uid_host: hostUid,
        agora_uid: hostUid,
        title,
        privacy: input.privacy,
        status: 'live',
        mode: 'agora_webcam',
        recording_status: 'idle',
        post_id: postId,
      } satisfies Partial<LiveSessionInsert>)
      .select(
        `
        id, host_user_id, user_id, mode, agora_channel, agora_channel_name, channel_name, title, description, privacy,
        status, viewer_count, cloudflare_live_input_id, cloudflare_video_uid, stream_key_last_reset_at,
        source_connected_at, go_live_clicked_at, playback_url, hls_url, live_post_id, replay_post_id,
        r2_video_url, playback_provider, storage_provider, archive_status, archive_error,
        started_at, ended_at, end_reason, created_at, updated_at, post_id,
        host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
      `
      )
      .single();

    if (error) throw error;

    const fullMetadata: LivePostMetadata = {
      ...liveMetadata,
      live_session_id: data.id,
      post_id: postId,
    };

    await supabase
      .from('posts')
      .update({ metadata: toJson(fullMetadata) })
      .eq('id', postId);

    notifyFriendsLiveStarted(data.id, postId!).catch((err) =>
      logger.warn('[liveService] notify-live-started failed:', err)
    );

    dispatchFeedInvalidation();

    return normalizeLiveSession(data as unknown as LiveSessionQueryRow);
  } catch (error) {
    if (postId) {
      await supabase.from('posts').delete().eq('id', postId);
    }
    throw error;
  }
}

export async function getLiveSession(sessionId: string): Promise<LiveSession | null> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      `
      id, host_user_id, user_id, mode, agora_channel, agora_channel_name, channel_name, recording_uid,
      recording_provider, recording_error_code, recording_error_message, browser_recording_status,
      browser_recording_warning, browser_recording_chunk_count, browser_recording_total_bytes,
      title, description, privacy,
      status, viewer_count, cloudflare_live_input_id, cloudflare_video_uid, stream_key_last_reset_at,
      source_connected_at, go_live_clicked_at, playback_url, hls_url, live_post_id, replay_post_id,
      r2_video_url, playback_provider, storage_provider, archive_status, archive_error,
      started_at, ended_at, end_reason, last_seen_at, last_host_heartbeat_at, host_connection_status,
      created_at, updated_at, post_id,
      host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
    `
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return normalizeLiveSession(data as unknown as LiveSessionQueryRow);
}

function normalizeRouteResolution(row: unknown): LiveRouteResolution | null {
  if (!row || typeof row !== 'object') return null;
  const value = row as Partial<LiveRouteResolution>;
  return typeof value.live_session_id === 'string' && value.live_session_id
    ? {
        live_session_id: value.live_session_id,
        status: value.status ?? null,
        post_id: value.post_id ?? null,
        live_post_id: value.live_post_id ?? null,
        replay_post_id: value.replay_post_id ?? null,
        playback_url: value.playback_url ?? null,
        r2_video_url: value.r2_video_url ?? null,
        archive_url: value.archive_url ?? null,
        replay_url: value.replay_url ?? null,
        recording_status: value.recording_status ?? null,
        archive_status: value.archive_status ?? null,
        host_connection_status: value.host_connection_status ?? null,
        last_seen_at: value.last_seen_at ?? null,
        last_host_heartbeat_at: value.last_host_heartbeat_at ?? null,
        ended_at: value.ended_at ?? null,
        end_reason: value.end_reason ?? null,
      }
    : null;
}

export async function resolveLiveRouteId(inputId?: string | null): Promise<LiveRouteResolution | null> {
  if (!inputId || !UUID_RE.test(inputId)) return null;

  try {
    const { data, error } = await (supabase.rpc as any)('resolve_live_session_route_id', { p_id: inputId })
      .maybeSingle();
    if (!error) {
      const resolved = normalizeRouteResolution(data);
      if (resolved) return resolved;
    } else if (import.meta.env.DEV) {
      logger.warn('[liveService] resolve_live_session_route_id failed, falling back:', error);
    }
  } catch (error) {
    if (import.meta.env.DEV) logger.warn('[liveService] resolve live route RPC unavailable:', error);
  }

  const { data: directRaw } = await supabase
    .from('live_sessions')
    .select('id, status, post_id, live_post_id, replay_post_id, playback_url, r2_video_url, archive_url, replay_url, recording_status, archive_status, host_connection_status, last_seen_at, last_host_heartbeat_at, ended_at, end_reason' as any)
    .eq('id', inputId)
    .maybeSingle();
  const direct = directRaw as any;
  if (direct?.id) {
    return {
      live_session_id: direct.id,
      status: direct.status,
      post_id: direct.post_id,
      live_post_id: direct.live_post_id,
      replay_post_id: direct.replay_post_id,
      playback_url: direct.playback_url,
      r2_video_url: direct.r2_video_url,
      archive_url: (direct as any).archive_url,
      replay_url: (direct as any).replay_url,
      recording_status: (direct as any).recording_status,
      archive_status: (direct as any).archive_status,
      host_connection_status: (direct as any).host_connection_status,
      last_seen_at: (direct as any).last_seen_at,
      last_host_heartbeat_at: (direct as any).last_host_heartbeat_at,
      ended_at: (direct as any).ended_at,
      end_reason: (direct as any).end_reason,
    };
  }

  const { data: post } = await supabase
    .from('posts')
    .select('metadata')
    .eq('id', inputId)
    .maybeSingle();
  const metadata = post?.metadata;
  const liveSessionFromPost =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as { live_session_id?: unknown }).live_session_id
      : undefined;
  if (typeof liveSessionFromPost === 'string' && UUID_RE.test(liveSessionFromPost)) {
    return { live_session_id: liveSessionFromPost };
  }

  const { data: sharedPost } = await supabase
    .from('shared_posts')
    .select('original_post_id')
    .eq('id', inputId)
    .maybeSingle();
  if (sharedPost?.original_post_id) {
    const resolved = await resolveLiveRouteId(sharedPost.original_post_id);
    if (resolved) return resolved;
  }

  const { data: sessionByPostRaw } = await supabase
    .from('live_sessions')
    .select('id, status, post_id, live_post_id, replay_post_id, playback_url, r2_video_url, archive_url, replay_url, recording_status, archive_status, host_connection_status, last_seen_at, last_host_heartbeat_at, ended_at, end_reason' as any)
    .or(`post_id.eq.${inputId},live_post_id.eq.${inputId},replay_post_id.eq.${inputId}`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sessionByPost = sessionByPostRaw as any;
  if (sessionByPost?.id) {
    return {
      live_session_id: sessionByPost.id,
      status: sessionByPost.status,
      post_id: sessionByPost.post_id,
      live_post_id: sessionByPost.live_post_id,
      replay_post_id: sessionByPost.replay_post_id,
      playback_url: sessionByPost.playback_url,
      r2_video_url: sessionByPost.r2_video_url,
      archive_url: (sessionByPost as any).archive_url,
      replay_url: (sessionByPost as any).replay_url,
      recording_status: (sessionByPost as any).recording_status,
      archive_status: (sessionByPost as any).archive_status,
      host_connection_status: (sessionByPost as any).host_connection_status,
      last_seen_at: (sessionByPost as any).last_seen_at,
      last_host_heartbeat_at: (sessionByPost as any).last_host_heartbeat_at,
      ended_at: (sessionByPost as any).ended_at,
      end_reason: (sessionByPost as any).end_reason,
    };
  }

  const { data: replayByPost } = await (supabase.from('live_replays' as any) as any)
    .select('live_session_id, replay_post_id, r2_video_url, playback_mp4, archive_mp4_url, playback_hls, replay_status, archive_status')
    .eq('replay_post_id', inputId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (replayByPost?.live_session_id) {
    return {
      live_session_id: replayByPost.live_session_id,
      replay_post_id: replayByPost.replay_post_id ?? null,
      playback_url: replayByPost.playback_mp4 ?? replayByPost.r2_video_url ?? replayByPost.archive_mp4_url ?? replayByPost.playback_hls ?? null,
      r2_video_url: replayByPost.r2_video_url ?? replayByPost.playback_mp4 ?? replayByPost.archive_mp4_url ?? null,
      archive_url: replayByPost.r2_video_url ?? replayByPost.playback_mp4 ?? replayByPost.archive_mp4_url ?? null,
      replay_url: replayByPost.r2_video_url ?? replayByPost.playback_mp4 ?? replayByPost.archive_mp4_url ?? null,
      archive_status: replayByPost.archive_status ?? null,
    };
  }

  return null;
}

export async function listActiveLiveSessions(): Promise<LiveSession[]> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      `
      id, host_user_id, user_id, mode, agora_channel, agora_channel_name, channel_name, title, description, privacy,
      status, viewer_count, cloudflare_live_input_id, cloudflare_video_uid, stream_key_last_reset_at,
      source_connected_at, go_live_clicked_at, playback_url, hls_url, live_post_id, replay_post_id,
      r2_video_url, playback_provider, storage_provider, archive_status, archive_error,
      started_at, ended_at, end_reason, created_at, updated_at, post_id,
      host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
    `
    )
    .in('status', ['live', 'reconnecting'])
    .order('started_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => normalizeLiveSession(row as unknown as LiveSessionQueryRow));
}

export async function endLiveSession(sessionId: string): Promise<void> {
  await endLiveSessionBackend(sessionId, 'host_clicked_end');
}

export async function endLiveSessionBackend(
  sessionId: string,
  reason: LiveEndReason = 'host_clicked_end'
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('live-end', {
    body: { live_session_id: sessionId, reason },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  dispatchFeedInvalidation();
  return (data || { ok: true }) as Record<string, unknown>;
}

export async function heartbeatLiveSession(sessionId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('live-heartbeat', {
    body: { live_session_id: sessionId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
}

export async function requestEndLiveKeepalive(
  sessionId: string,
  reason: LiveEndReason,
  accessToken?: string | null
): Promise<void> {
  if (!accessToken) return;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  await fetch(`${supabaseUrl}/functions/v1/live-end`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify({ live_session_id: sessionId, reason }),
  }).catch((error) => {
    logger.warn('[liveService] keepalive live-end failed:', error);
  });
}

export async function finalizeLiveSession(
  sessionId: string,
  options: FinalizeLiveSessionOptions = {}
): Promise<void> {
  const {
    playbackUrl = null,
    recordingStatus = playbackUrl ? 'ready' : 'failed',
    endReason = recordingStatus === 'failed' ? 'recording_failed' : 'manual',
  } = options;
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('live_sessions')
    .update({
      status: 'ended',
      ended_at: nowIso,
      end_reason: endReason,
      recording_status: recordingStatus,
      updated_at: nowIso,
    })
    .eq('id', sessionId)
    .select('id, post_id, replay_post_id, title, agora_channel, channel_name, ended_at')
    .single();

  if (error) throw error;

  if (data?.post_id) {
    await mergeLivePostMetadata(data.post_id, {
      live_status: 'ended',
      ended_at: data.ended_at,
      live_session_id: data.id,
      playback_url: playbackUrl,
      ...(playbackUrl
        ? { playback_provider: 'r2', playback_type: 'r2', replay_status: 'ready', replay_ready: true }
        : { replay_status: 'processing' }),
    });

    if (playbackUrl) {
      await supabase.from('posts')
        .update({ video_url: playbackUrl })
        .eq('id', data.post_id);
    }

    // Đồng bộ replay_post_id = post_id nếu chưa có để các route ưu tiên replay_post_id hoạt động đúng.
    if (!data.replay_post_id) {
      await supabase
        .from('live_sessions')
        .update({ replay_post_id: data.post_id })
        .eq('id', sessionId)
        .is('replay_post_id', null);
    }
  }

  dispatchFeedInvalidation();
}

export async function markLiveSessionFailed(
  sessionId: string,
  options: MarkLiveSessionFailedOptions = {}
): Promise<void> {
  const nowIso = new Date().toISOString();
  const endReason = options.endReason ?? 'agora_failed';
  const { data, error } = await supabase
    .from('live_sessions')
    .update({
      status: 'failed',
      ended_at: nowIso,
      end_reason: endReason,
      recording_status: 'failed',
      recording_error: options.errorMessageInternal ?? options.errorCode ?? null,
      updated_at: nowIso,
    } as Partial<LiveSessionRow>)
    .eq('id', sessionId)
    .select('id, post_id, ended_at')
    .maybeSingle();

  if (error) throw error;

  if (data?.post_id) {
    await mergeLivePostMetadata(data.post_id, {
      live_status: 'ended',
      ended_at: data.ended_at,
      live_session_id: data.id,
      replay_status: 'failed',
      error_code: options.errorCode ?? null,
    });
  }
}

export async function updateLiveViewerCount(sessionId: string, viewerCount: number): Promise<void> {
  const nextCount = Math.max(0, viewerCount);
  const { data } = await supabase
    .from('live_sessions')
    .update({ viewer_count: nextCount })
    .eq('id', sessionId)
    .select('id, post_id, title, agora_channel, channel_name, started_at')
    .maybeSingle();

  if (data?.post_id) {
    const viewerMetadata: LivePostMetadata = {
      live_title: data.title,
      channel_name: data.agora_channel || data.channel_name,
      agora_channel: data.agora_channel || data.channel_name,
      live_status: 'live',
      live_mode: 'agora_webcam',
      viewer_count: nextCount,
      live_session_id: data.id,
      post_id: data.post_id,
      started_at: (data as { started_at?: string | null }).started_at ?? null,
    };

    await supabase
      .from('posts')
      .update({ metadata: toJson(viewerMetadata) })
      .eq('id', data.post_id);
  }
}

/**
 * SECURITY (2026-08-14): 2 wrapper `incrementLiveViewerCount` / `decrementLiveViewerCount`
 * đã bị xoá. RPC `increment_live_viewer_count` / `decrement_live_viewer_count` cho phép
 * anon bơm/dìm viewer_count của bất kỳ session → đã REVOKE khỏi PUBLIC/anon/authenticated.
 * Số người xem được host cập nhật qua `updateLiveViewerSnapshot` (RLS host-only) ở trên.
 * KHÔNG thêm lại wrapper gọi RPC này từ client.
 */

export async function uploadLiveRecording(
  blob: Blob,
  liveSessionId: string,
  mimeType: string,
  onProgress?: (percent: number) => void
): Promise<UploadLiveRecordingResult> {
  const baseMimeType = mimeType.split(';')[0].trim();
  const extension = baseMimeType.includes('webm') ? 'webm' : 'mp4';
  const customPath = `live/${liveSessionId}/recording-${Date.now()}.${extension}`;

  const file = new File([blob], `recording.${extension}`, { type: baseMimeType });

  const result = await uploadToR2(file, 'videos', customPath, undefined, onProgress);

  return { key: result.key, url: result.url };
}

export async function saveLiveReplay(liveSessionId: string, playbackUrl?: string | null): Promise<void> {
  await finalizeLiveSession(liveSessionId, {
    playbackUrl: playbackUrl || null,
    recordingStatus: playbackUrl ? 'ready' : 'failed',
  });
}

// �”€�”€�”€ Chunked Recording: Upload via Edge Function (Presigned URL) �”€�”€�”€�”€�”€

/**
 * Upload a single chunk via presigned URL from r2-signed-chunk-url Edge Function.
 */
export async function uploadLiveChunk(
  blob: Blob,
  recordingId: string,
  chunkIndex: number,
  mimeType: string,
  durationMs?: number
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // 1. Get presigned URL from Edge Function
  const presignRes = await fetch(`${supabaseUrl}/functions/v1/r2-signed-chunk-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      recording_id: recordingId,
      seq: chunkIndex,
      contentType: mimeType || 'video/webm',
      fileSize: blob.size,
    }),
  });

  if (!presignRes.ok) {
    const errBody = await presignRes.text().catch(() => 'no body');
    throw new Error(`Presign chunk #${chunkIndex} failed: ${presignRes.status} �€” ${errBody}`);
  }

  const { uploadUrl, objectKey } = await presignRes.json() as { uploadUrl: string; objectKey: string };

  // 2. Upload blob directly to R2 via presigned URL
  const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: blob });
  if (!uploadRes.ok) {
    throw new Error(`Chunk #${chunkIndex} R2 upload failed: ${uploadRes.status}`);
  }

  // 3. Record chunk in DB
  await supabase
    .from('chunked_recording_chunks')
    .insert({
      recording_id: recordingId,
      seq: chunkIndex,
      object_key: objectKey,
      bytes: blob.size,
      duration_ms: durationMs ?? null,
      status: 'uploaded',
      uploaded_at: new Date().toISOString(),
    });

  // 4. Update last_seq_uploaded
  await supabase
    .from('chunked_recordings')
    .update({ last_seq_uploaded: chunkIndex })
    .eq('id', recordingId);

  logger.debug(`[uploadLiveChunk] #${chunkIndex} �œ“ key=${objectKey}`);
  return objectKey;
}

/**
 * Finalize a chunked recording via recording-finalize Edge Function.
 */
export async function finalizeLiveChunks(
  recordingId: string,
  liveSessionId?: string
): Promise<{ manifestUrl: string; totalChunks: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/recording-finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ recording_id: recordingId, live_session_id: liveSessionId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Finalize failed' })) as { error?: string };
    throw new Error(err.error || `Finalize failed: ${res.status}`);
  }

  const data = await res.json() as { success: boolean; manifest_url?: string; replay_url?: string; total_chunks: number };
  const url = data.manifest_url || data.replay_url || '';
  return { manifestUrl: url, totalChunks: data.total_chunks };
}

export async function createLiveReplayUpload(
  liveSessionId: string,
  chunkedRecordingId: string,
  expectedSize: number
): Promise<LiveReplayUploadSession> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/live-replay-create-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      live_session_id: liveSessionId,
      chunked_recording_id: chunkedRecordingId,
      expected_size: expectedSize,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Create upload failed' })) as { error?: string };
    throw new Error(err.error || `Create Stream upload failed: ${res.status}`);
  }

  return res.json() as Promise<LiveReplayUploadSession>;
}

export async function uploadReplayToCloudflareStream(
  uploadURL: string,
  blob: Blob,
  filename = 'live-replay.webm',
  onProgress?: (percent: number) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', new File([blob], filename, { type: blob.type || 'video/webm' }));

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Cloudflare Stream upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Cloudflare Stream upload network error'));
    xhr.open('POST', uploadURL);
    xhr.send(formData);
  });
}

/**
 * Yêu cầu Cloudflare Stream K�‰O file replay từ R2 (server-side ingest).
 * Không cần upload lại file WebM từ trình duy�‡t �†’ "End Live" tr�Ÿ về tức thì.
 */
export async function ingestLiveReplayFromR2(
  liveSessionId: string,
  chunkedRecordingId: string,
): Promise<{ replay_id: string; stream_uid: string | null; status: 'processing' | 'ready' | 'queued' | 'skipped_legacy'; reused?: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/live-replay-ingest-from-r2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      live_session_id: liveSessionId,
      chunked_recording_id: chunkedRecordingId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ingest failed' })) as { error?: string };
    throw new Error(err.error || `Ingest from R2 failed: ${res.status}`);
  }

  return res.json() as Promise<{ replay_id: string; stream_uid: string | null; status: 'processing' | 'ready' | 'queued' | 'skipped_legacy'; reused?: boolean }>;
}

export async function markLiveReplayQueued(replayId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/live-replay-mark-uploaded`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ replay_id: replayId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to mark replay queued' })) as { error?: string };
    throw new Error(err.error || `Failed to mark replay queued: ${res.status}`);
  }
}

export async function waitForLiveReplayReady(
  replayId: string,
  timeoutMs = 20 * 60 * 1000
): Promise<LiveReplayRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: initial, error: initialErr } = await (supabase.from('live_replays' as any) as any)
    .select('*')
    .eq('id', replayId)
    .maybeSingle();
  if (initialErr) throw initialErr;
  if (initial?.status === 'ready') return initial as LiveReplayRow;
  if (initial?.status === 'failed') throw new Error(initial.error_message || 'Replay processing failed');

  return new Promise<LiveReplayRow>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      supabase.removeChannel(channel);
      reject(new Error('Replay processing timeout'));
    }, timeoutMs);

    const channel = supabase
      .channel(`live-replay-${replayId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_replays',
        filter: `id=eq.${replayId}`,
      }, (payload: { new: LiveReplayRow }) => {
        if (payload.new.status === 'ready') {
          window.clearTimeout(timer);
          supabase.removeChannel(channel);
          resolve(payload.new);
        } else if (payload.new.status === 'failed') {
          window.clearTimeout(timer);
          supabase.removeChannel(channel);
          reject(new Error(payload.new.error_message || 'Replay processing failed'));
        }
      })
      .subscribe();
  });
}

/**
 * Create a chunked_recordings row in DB to track the recording session.
 */
export async function createChunkedRecording(
  userId: string,
  liveSessionId: string,
  channelName?: string,
  mimeType: string = 'video/webm;codecs=vp8,opus'
): Promise<string> {
  const { data, error } = await supabase
    .from('chunked_recordings')
    .insert({
      user_id: userId,
      live_session_id: liveSessionId,
      channel_name: channelName,
      mime_type: mimeType,
      status: 'recording',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

// �”€�”€�”€ Notifications �”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€�”€

async function notifyFriendsLiveStarted(sessionId: string, postId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/notify-live-started`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ session_id: sessionId, post_id: postId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${response.status}`);
  }
}
