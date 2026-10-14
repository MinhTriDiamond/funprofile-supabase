import { CloudflareApiError, getCloudflareErrorCodes } from './cloudflareApiError.ts';

export interface StreamPlaybackUrls {
  hls: string;
  dash: string;
  mp4: string;
  thumbnail: string;
}

export interface StreamDownloadStatus {
  url: string | null;
  ready: boolean;
  percentComplete: number | null;
  raw: unknown;
  httpStatus?: number;
  notFound?: boolean;
}

function rewriteIngestUrl(url: string | null): string | null {
  if (!url) return null;
  const customHost = Deno.env.get('CLOUDFLARE_STREAM_INGEST_HOST')?.trim();
  if (!customHost) return url;
  return url.replace(/(rtmps?:\/\/)[^/:]+/i, `$1${customHost}`);
}

export function getStreamAccountId(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
}

export function getStreamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') ||
    Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN') ||
    Deno.env.get('CLOUDFLARE_API_TOKEN');
}

export interface StreamLiveInput {
  uid: string;
  rtmpsUrl: string | null;
  rtmpsStreamKey: string | null;
  srtUrl?: string | null;
  webRtcUrl?: string | null;
  raw: unknown;
}

export function getStreamPlaybackUrls(uid: string): StreamPlaybackUrls {
  const code = Deno.env.get('CLOUDFLARE_STREAM_CUSTOMER_CODE');
  const base = code ? `https://customer-${code}.cloudflarestream.com/${uid}` : `https://videodelivery.net/${uid}`;
  return {
    hls: `${base}/manifest/video.m3u8`,
    dash: `${base}/manifest/video.mpd`,
    mp4: `${base}/downloads/default.mp4`,
    thumbnail: `${base}/thumbnails/thumbnail.jpg?time=3s`,
  };
}

export async function getStreamVideo(uid: string): Promise<Record<string, unknown> | null> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.success) return null;
  return data.result || null;
}

export async function requestMp4Download(uid: string): Promise<StreamDownloadStatus> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  // Guard: chỉ POST /downloads khi video Stream đã ở state 'ready'.
  // Tránh lỗi 400 vô nghĩa khi video còn 'inprogress'/'queued'/'pendingupload'/'live-input'.
  const meta = await getStreamVideo(uid).catch(() => null);
  if (meta) {
    const state = String((meta as any)?.status?.state || '').toLowerCase();
    if (state === 'error') {
      const err = new Error(`Cloudflare Stream video state=error (${(meta as any)?.status?.errorReasonText || 'unknown'})`) as Error & {
        httpStatus?: number; notFound?: boolean;
      };
      err.httpStatus = 410;
      err.notFound = true; // mark unrecoverable cho catch-block phía archiveReplayService
      throw err;
    }
    if (state && state !== 'ready') {
      // Throw "MP4 not ready" để catch-block coi như cần retry, KHÔNG ghi failed cứng.
      const err = new Error(`Cloudflare MP4 not ready (state=${state})`) as Error & {
        httpStatus?: number; notFound?: boolean;
      };
      err.httpStatus = 409;
      throw err;
    }
  }

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || data?.success === false) {
    const notFound = resp.status === 404
      || /not.*found|deleted/i.test(JSON.stringify(data?.errors || ''));
    const err = new Error(`Cloudflare Stream MP4 request failed: ${resp.status}`) as Error & {
      httpStatus?: number; notFound?: boolean; retryAfterSeconds?: number; rateLimited?: boolean;
    };
    err.httpStatus = resp.status;
    err.notFound = notFound;
    if (resp.status === 429) {
      err.rateLimited = true;
      const ra = resp.headers.get('retry-after');
      const parsed = ra ? Number(ra) : NaN;
      err.retryAfterSeconds = Number.isFinite(parsed) && parsed > 0 ? Math.min(120, parsed) : 45;
    }
    throw err;
  }

  const info = data?.result?.default || {};
  const url = info.url || getStreamPlaybackUrls(uid).mp4;
  const percent = typeof info.percentComplete === 'number' ? info.percentComplete : null;
  return { url, ready: !!url && (percent === null || percent >= 100), percentComplete: percent, raw: data, httpStatus: resp.status };
}

export async function pollMp4DownloadUrl(uid: string, attempts = 20, delayMs = 5000): Promise<StreamDownloadStatus> {
  let last: StreamDownloadStatus | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await requestMp4Download(uid);
    if (last.ready && last.url) return last;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last || { url: null, ready: false, percentComplete: null, raw: null };
}

export async function deleteStreamVideo(uid: string): Promise<{ deleted: boolean; status: number; raw: string }> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const raw = await resp.text().catch(() => '');
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Cloudflare Stream delete failed: ${resp.status} ${raw.slice(0, 200)}`);
  }
  return { deleted: true, status: resp.status, raw };
}

export async function getStreamLiveInput(inputId: string): Promise<Record<string, unknown> | null> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${inputId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.success) return null;
  return data.result || null;
}

/**
 * Phân biệt rõ "Live Input không còn tồn tại ở Cloudflare" (404 / code 10003)
 * với "lỗi tạm thời khi gọi API".
 * - exists = true  → input còn sống
 * - exists = false → Cloudflare xác nhận không tìm thấy (Stream Key đã chết)
 * - exists = null  → chưa xác định được (lỗi mạng / token / 5xx) → KHÔNG tự huỷ key
 */
export async function checkStreamLiveInputExists(
  inputId: string,
): Promise<{ exists: boolean | null; status: number | null; input: Record<string, unknown> | null; error: string | null }> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) return { exists: null, status: null, input: null, error: 'missing_cloudflare_config' };

  try {
    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${inputId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json().catch(() => null) as
      | { success?: boolean; result?: Record<string, unknown>; errors?: { code?: number; message?: string }[] }
      | null;
    const notFoundCode = (data?.errors || []).some((e) => Number(e?.code) === 10003);
    if (resp.status === 404 || notFoundCode) {
      return { exists: false, status: resp.status, input: null, error: 'live_input_missing' };
    }
    if (resp.ok && data?.success) {
      return { exists: true, status: resp.status, input: data.result || null, error: null };
    }
    return { exists: null, status: resp.status, input: null, error: `cloudflare_error_${resp.status}` };
  } catch (err) {
    return { exists: null, status: null, input: null, error: err instanceof Error ? err.message : String(err) };
  }
}


/**
 * Cloudflare Live Input status payload (current schema, 2024-2026):
 * {
 *   status: { current: { state: "connected"|"disconnected"|"reconnected"|"idle", reason, statusEnteredAt, statusLastSeen },
 *             history: [...] }
 * }
 * Older shapes also seen: status: "connected" (string), state: "connected", connected: true.
 */
export function getLiveInputState(input: Record<string, unknown> | null): string {
  if (!input) return '';
  const statusField = (input as { status?: unknown }).status;
  // New shape: status is an object with `current.state`
  if (statusField && typeof statusField === 'object') {
    const current = (statusField as { current?: { state?: unknown } }).current;
    if (current && typeof current === 'object') {
      const state = (current as { state?: unknown; status?: unknown }).state
        || (current as { state?: unknown; status?: unknown }).status;
      if (typeof state === 'string') return state.toLowerCase();
    }
    const directState = (statusField as { state?: unknown }).state;
    if (typeof directState === 'string') return directState.toLowerCase();
  }
  // Legacy: status is a string
  if (typeof statusField === 'string') return statusField.toLowerCase();
  // Other fallbacks
  if ((input as { connected?: unknown }).connected === true) return 'connected';
  if ((input as { live?: unknown }).live === true) return 'live';
  if ((input as { readyToStream?: unknown }).readyToStream === true) return 'readytostream';
  const rtmps = (input as { rtmps?: Record<string, unknown> }).rtmps || {};
  const srt = (input as { srt?: Record<string, unknown> }).srt || {};
  const webRTC = (input as { webRTC?: Record<string, unknown> }).webRTC || {};
  const recording = (input as { recording?: Record<string, unknown> }).recording || {};
  const nestedState = String(
    (input as any).liveInputState
      || rtmps.status
      || rtmps.state
      || srt.status
      || webRTC.status
      || recording.status
      || '',
  ).toLowerCase();
  return nestedState;
}

export function isStreamVideoLive(video: Record<string, unknown> | null): boolean {
  if (!video) return false;
  if ((video as { live?: unknown }).live === true) return true;
  if ((video as { readyToStream?: unknown }).readyToStream === true) return true;
  const statusField = (video as { status?: unknown }).status;
  const statusObject = statusField && typeof statusField === 'object' ? statusField as Record<string, unknown> : {};
  const current = (statusObject as { current?: unknown }).current;
  const currentState = current && typeof current === 'object'
    ? (current as { state?: unknown; status?: unknown }).state || (current as { state?: unknown; status?: unknown }).status
    : current;
  const state = String(
    statusObject.state
      || statusObject.current
      || (statusObject as any).pctComplete
      || video.status
      || video.state
      || video.live
      || video.readyToStream
      || (video as any).liveInput
      || '',
  ).toLowerCase();
  return video.live === true
    || video.readyToStream === true
    || state.includes('live')
    || state.includes('ready')
    || state.includes('stream')
    || state.includes('inprogress')
    || state.includes('in_progress')
    || state.includes('queued')
    || state.includes('pendingupload')
    || state.includes('downloading');
}

export async function createStreamLiveInput(options: {
  name: string;
  userId: string;
  liveSessionId: string;
}): Promise<StreamLiveInput> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      meta: {
        name: options.name,
        source: 'fun-profile-rtmp-obs',
        userId: options.userId,
        liveSessionId: options.liveSessionId,
      },
      recording: {
        mode: 'automatic',
        requireSignedURLs: false,
        allowedOrigins: ['*'],
        timeoutSeconds: 0,
      },
      allowedOrigins: ['*'],
      requireSignedURLs: false,
    }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.success || !data?.result?.uid) {
    throw new CloudflareApiError('Live Input create', resp.status, getCloudflareErrorCodes(data));
  }
  const input = data.result;
  return {
    uid: input.uid,
    rtmpsUrl: rewriteIngestUrl(input.rtmps?.url || null),
    rtmpsStreamKey: input.rtmps?.streamKey || input.rtmps?.stream_key || null,
    srtUrl: input.srt?.url || null,
    webRtcUrl: input.webRTC?.url || null,
    raw: data,
  };
}

export async function deleteStreamLiveInput(inputId: string): Promise<void> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${inputId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Cloudflare Live Input delete failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  }
}

export async function setStreamLiveInputEnabled(inputId: string, enabled: boolean): Promise<{ enabled: boolean; status: number; raw: unknown }> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${inputId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || data?.success === false) {
    throw new Error(`Cloudflare Live Input update failed: ${resp.status} ${JSON.stringify(data?.errors || data).slice(0, 300)}`);
  }
  return { enabled, status: resp.status, raw: data };
}

export async function listStreamLiveInputVideos(inputId: string): Promise<Record<string, unknown>[]> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${inputId}/videos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.success) return [];
  const result = data.result;
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.videos)) return result.videos;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

/**
 * True khi Cloudflare Live Input đang nhận stream (RTMP/SRT/WebRTC).
 * Bọc getLiveInputState() — chỉ coi là connected khi state thuộc whitelist.
 */
export function isLiveInputConnected(input: Record<string, unknown> | null): boolean {
  return isLiveInputActivelyConnected(input);
}

export function isLiveInputActivelyConnected(input: Record<string, unknown> | null): boolean {
  if (!input) return false;
  const state = getLiveInputState(input);
  if (!state) return false;
  if (
    state === 'disconnected'
    || state === 'disconnect'
    || state === 'not_connected'
    || state === 'not connected'
    || state === 'idle'
    || state === 'offline'
    || state === 'ready'
    || state === 'readytostream'
    || state === 'ready_to_stream'
    || state === 'pendingupload'
    || state === 'queued'
    || state === 'inprogress'
    || state === 'in_progress'
    || state.includes('disconnect')
    || state.includes('not_connected')
    || state.includes('not connected')
  ) return false;
  return (
    state === 'connected' ||
    state === 'reconnected' ||
    state === 'live' ||
    state === 'active' ||
    state === 'streaming' ||
    state === 'live-inprogress' ||
    state === 'live_in_progress' ||
    state.includes('connected') ||
    state.includes('reconnected') ||
    state.includes('live') ||
    state.includes('streaming') ||
    state.includes('active')
  );
}

/**
 * Chọn video "hiện hành" của 1 Live Input từ list trả về bởi listStreamLiveInputVideos().
 * - Ưu tiên video đang live/ready (isStreamVideoLive).
 * - Nếu không có, trả phần tử mới nhất theo `created` desc.
 * - Trả null khi rỗng.
 */
export function selectCurrentLiveInputVideo(
  videos: Record<string, unknown>[] | null | undefined,
): Record<string, unknown> | null {
  if (!videos || videos.length === 0) return null;
  const live = videos.find((v) => isStreamVideoLive(v));
  if (live) return live;
  const sorted = [...videos].sort((a, b) => {
    const ta = Date.parse(String((a as { created?: unknown }).created ?? '')) || 0;
    const tb = Date.parse(String((b as { created?: unknown }).created ?? '')) || 0;
    return tb - ta;
  });
  return sorted[0] || videos[0] || null;
}

/**
 * STRICT: Chỉ true khi Cloudflare video ĐANG ở trạng thái live thực sự (encoder push RTMP).
 * KHÔNG coi VOD/replay (ready/queued/pendingupload) là live.
 * Dùng cho luồng detect "có nguồn video realtime" của Producer.
 */
export function isStreamVideoActivelyLive(video: Record<string, unknown> | null): boolean {
  if (!video) return false;
  // Cờ tường minh: live=true ⇒ chắc chắn đang live
  if ((video as { live?: unknown }).live === true) return true;
  const statusField = (video as { status?: unknown }).status;
  const statusObject = statusField && typeof statusField === 'object' ? statusField as Record<string, unknown> : {};
  const current = (statusObject as { current?: unknown }).current;
  const currentState = current && typeof current === 'object'
    ? String((current as { state?: unknown; status?: unknown }).state || (current as { state?: unknown; status?: unknown }).status || '').toLowerCase()
    : (typeof current === 'string' ? current.toLowerCase() : '');
  const flatState = String(
    statusObject.state
      || (statusObject as any).phase
      || (statusObject as any).pctComplete
      || (typeof statusField === 'string' ? statusField : '')
      || (video as any).state
      || '',
  ).toLowerCase();
  const state = currentState || flatState;
  if (!state) return false;
  if (
    state === 'ready'
    || state === 'readytostream'
    || state === 'ready_to_stream'
    || state === 'pendingupload'
    || state === 'queued'
    || state === 'inprogress'
    || state === 'in_progress'
    || state.includes('ready')
  ) return false;
  // Whitelist hẹp: chỉ các state biểu thị encoder ĐANG push frame realtime
  return (
    state === 'live-inprogress'
    || state === 'live_in_progress'
    || state === 'live'
    || state === 'streaming'
    || state === 'connected'
    || state.includes('live-inprogress')
    || state.includes('live_in_progress')
    || state.includes('streaming')
  );
}

/**
 * RELAXED: True khi Cloudflare video đã có manifest HLS phát được (live đang push HOẶC ready VOD của phiên).
 * Dùng RIÊNG để chọn UID dựng preview cho Producer, KHÔNG dùng cho phân loại live/VOD.
 * Loại bỏ pendingupload/queued/inprogress upload/failed.
 */
export function isStreamVideoPlayable(video: Record<string, unknown> | null): boolean {
  if (!video) return false;
  if ((video as { live?: unknown }).live === true) return true;
  if ((video as { readyToStream?: unknown }).readyToStream === true) return true;
  const statusField = (video as { status?: unknown }).status;
  const statusObject = statusField && typeof statusField === 'object' ? statusField as Record<string, unknown> : {};
  const current = (statusObject as { current?: unknown }).current;
  const currentState = current && typeof current === 'object'
    ? String((current as { state?: unknown; status?: unknown }).state || (current as { state?: unknown; status?: unknown }).status || '').toLowerCase()
    : (typeof current === 'string' ? current.toLowerCase() : '');
  const flatState = String(statusObject.state || (typeof statusField === 'string' ? statusField : '') || (video as any).state || '').toLowerCase();
  const state = currentState || flatState;
  if (!state) return false;
  if (
    state === 'pendingupload'
    || state === 'queued'
    || state === 'inprogress'
    || state === 'in_progress'
    || state === 'failed'
    || state === 'error'
  ) return false;
  return (
    state === 'ready'
    || state === 'readytostream'
    || state === 'ready_to_stream'
    || state === 'live'
    || state === 'live-inprogress'
    || state === 'live_in_progress'
    || state === 'streaming'
    || state === 'connected'
    || state.includes('ready')
    || state.includes('live')
    || state.includes('streaming')
  );
}

/**
 * Chọn video playable thuộc phiên hiện tại để dựng preview URL.
 * Ưu tiên video đang actively live; fallback sang video playable mới nhất.
 */
export function selectPlayableLiveVideo(
  videos: Record<string, unknown>[] | null | undefined,
  sessionStartedAt: string | Date | null | undefined,
  skewSeconds = 60,
): Record<string, unknown> | null {
  if (!videos || videos.length === 0) return null;
  const startMs = sessionStartedAt
    ? (sessionStartedAt instanceof Date ? sessionStartedAt.getTime() : Date.parse(String(sessionStartedAt)))
    : 0;
  const cutoffMs = Number.isFinite(startMs) && startMs > 0 ? startMs - skewSeconds * 1000 : 0;
  const fresh = cutoffMs > 0
    ? videos.filter((v) => {
        const created = Date.parse(String((v as { created?: unknown }).created ?? '')) || 0;
        return created >= cutoffMs;
      })
    : videos;
  const activelyLive = fresh.find((v) => isStreamVideoActivelyLive(v));
  if (activelyLive) return activelyLive;
  const playable = fresh.filter((v) => isStreamVideoPlayable(v));
  if (playable.length === 0) return null;
  const sorted = [...playable].sort((a, b) => {
    const ta = Date.parse(String((a as { created?: unknown }).created ?? '')) || 0;
    const tb = Date.parse(String((b as { created?: unknown }).created ?? '')) || 0;
    return tb - ta;
  });
  return sorted[0] || null;
}

export function isStreamVideoReadyVod(video: Record<string, unknown> | null): boolean {
  if (!video) return false;
  if ((video as { readyToStream?: unknown }).readyToStream === true) return true;
  const statusField = (video as { status?: unknown }).status;
  const statusObject = statusField && typeof statusField === 'object' ? statusField as Record<string, unknown> : {};
  const current = (statusObject as { current?: unknown }).current;
  const currentState = current && typeof current === 'object'
    ? String((current as { state?: unknown; status?: unknown }).state || (current as { state?: unknown; status?: unknown }).status || '').toLowerCase()
    : (typeof current === 'string' ? current.toLowerCase() : '');
  const flatState = String(statusObject.state || (typeof statusField === 'string' ? statusField : '') || (video as any).state || '').toLowerCase();
  const state = currentState || flatState;
  return state === 'ready' || state === 'readytostream' || state === 'ready_to_stream';
}

/**
 * Chọn video "đang live realtime" thuộc PHIÊN HIỆN TẠI.
 * - Lọc theo `created` >= sessionStartedAt - skewSeconds (mặc định 60s) để không chộp VOD phiên cũ.
 * - Trong tập đó, chỉ lấy video thoả isStreamVideoActivelyLive.
 * - Trả null nếu không có ⇒ KHÔNG có nguồn video realtime cho phiên hiện tại.
 */
export function selectActiveLiveVideo(
  videos: Record<string, unknown>[] | null | undefined,
  sessionStartedAt: string | Date | null | undefined,
  skewSeconds = 60,
): Record<string, unknown> | null {
  if (!videos || videos.length === 0) return null;
  const startMs = sessionStartedAt
    ? (sessionStartedAt instanceof Date ? sessionStartedAt.getTime() : Date.parse(String(sessionStartedAt)))
    : 0;
  const cutoffMs = Number.isFinite(startMs) && startMs > 0 ? startMs - skewSeconds * 1000 : 0;
  const fresh = cutoffMs > 0
    ? videos.filter((v) => {
        const created = Date.parse(String((v as { created?: unknown }).created ?? '')) || 0;
        return created >= cutoffMs;
      })
    : videos;
  return fresh.find((v) => isStreamVideoActivelyLive(v)) || null;
}

export interface RtmpReplayVideoSelection {
  video: Record<string, unknown> | null;
  uid: string | null;
  reason: string;
  rejected: Array<{ uid: string | null; reason: string }>;
  candidates: number;
  diagnostics?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function parseTimeMs(value: unknown): number {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getVideoUid(video: Record<string, unknown>): string | null {
  return firstString(video.uid, video.id, (video as any).videoId, (video as any).video_id);
}

function getVideoMeta(video: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord((video as any).data);
  return asRecord(video.meta || data.meta);
}

function getVideoLiveSessionId(video: Record<string, unknown>): string | null {
  const meta = getVideoMeta(video);
  const data = asRecord((video as any).data);
  return firstString(
    meta.liveSessionId,
    meta.live_session_id,
    meta.live_session,
    video.liveSessionId,
    (video as any).live_session_id,
    data.liveSessionId,
    data.live_session_id,
  );
}

function getVideoUserId(video: Record<string, unknown>): string | null {
  const meta = getVideoMeta(video);
  const data = asRecord((video as any).data);
  return firstString(
    meta.userId,
    meta.user_id,
    meta.ownerId,
    meta.owner_id,
    video.userId,
    (video as any).user_id,
    data.userId,
    data.user_id,
  );
}

function getVideoLiveInputId(video: Record<string, unknown>): string | null {
  const data = asRecord((video as any).data);
  const input = asRecord(video.input || data.input);
  const liveInput = asRecord(video.liveInput || data.liveInput || data.live_input);
  return firstString(
    video.liveInput,
    (video as any).live_input,
    (video as any).liveInputUid,
    input.uid,
    input.id,
    liveInput.uid,
    liveInput.id,
    data.liveInput,
    data.live_input,
  );
}

function getVideoCreatedMs(video: Record<string, unknown>): number {
  return parseTimeMs(
    video.created
      || (video as any).created_on
      || (video as any).createdAt
      || (video as any).created_at
      || (video as any).uploaded
      || (video as any).modified,
  );
}

function getVideoDurationSeconds(video: Record<string, unknown>): number | null {
  const raw = (video as any).duration
    || (video as any).durationSeconds
    || (video as any).duration_seconds
    || asRecord((video as any).meta).duration
    || asRecord((video as any).data).duration;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getSessionOwnerId(session: Record<string, unknown>): string | null {
  return firstString(session.owner_id, session.host_user_id, session.user_id);
}

function getSessionStartMs(session: Record<string, unknown>): number {
  return parseTimeMs(
    session.go_live_clicked_at
      || session.started_at
      || session.armed_at
      || session.created_at,
  );
}

function getSessionEndMs(session: Record<string, unknown>): number {
  return parseTimeMs(session.ended_at);
}

function getExpectedSessionDurationSeconds(session: Record<string, unknown>): number | null {
  const startMs = getSessionStartMs(session);
  const endMs = getSessionEndMs(session);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs <= 0 || endMs <= 0 || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 1000);
}

export function validateRtmpReplayVideoForSession(
  video: Record<string, unknown> | null,
  session: Record<string, unknown>,
  options: { preferredUid?: string | null; skewSeconds?: number; afterEndMinutes?: number } = {},
): { ok: boolean; uid: string | null; reason: string; exactSessionMeta: boolean; createdMs: number } {
  if (!video) return { ok: false, uid: null, reason: 'missing_video', exactSessionMeta: false, createdMs: NaN };
  const uid = getVideoUid(video);
  if (!uid) return { ok: false, uid: null, reason: 'missing_video_uid', exactSessionMeta: false, createdMs: NaN };
  if (options.preferredUid && uid !== String(options.preferredUid)) {
    return { ok: false, uid, reason: 'not_preferred_uid', exactSessionMeta: false, createdMs: getVideoCreatedMs(video) };
  }

  const sessionId = firstString(session.id);
  const sessionOwnerId = getSessionOwnerId(session);
  const sessionInputId = firstString(session.cloudflare_live_input_id);
  const videoSessionId = getVideoLiveSessionId(video);
  const videoUserId = getVideoUserId(video);
  const videoInputId = getVideoLiveInputId(video);
  const exactSessionMeta = !!(sessionId && videoSessionId && videoSessionId === sessionId);
  const isTrustedPreferredUid = !!(options.preferredUid && uid === String(options.preferredUid));

  if (sessionId && videoSessionId && videoSessionId !== sessionId) {
    return { ok: false, uid, reason: 'invalid_live_session_meta', exactSessionMeta: false, createdMs: getVideoCreatedMs(video) };
  }
  if (sessionOwnerId && videoUserId && videoUserId !== sessionOwnerId) {
    return { ok: false, uid, reason: 'invalid_user_meta', exactSessionMeta, createdMs: getVideoCreatedMs(video) };
  }
  if (sessionInputId && videoInputId && videoInputId !== sessionInputId) {
    return { ok: false, uid, reason: 'invalid_live_input', exactSessionMeta, createdMs: getVideoCreatedMs(video) };
  }

  const createdMs = getVideoCreatedMs(video);
  const startMs = getSessionStartMs(session);
  const endMs = getSessionEndMs(session);
  const skewMs = Math.max(0, options.skewSeconds ?? 60) * 1000;
  const afterEndMs = Math.max(0, options.afterEndMinutes ?? 10) * 60_000;

  // Preferred UID is set by stream-webhook after Cloudflare confirms the video belongs
  // to this live input + session. Trust it unconditionally even if `created` timestamp
  // drifts outside the DB session window (Cloudflare timestamps OBS connect, not started_at).
  if (isTrustedPreferredUid) {
    return { ok: true, uid, reason: 'preferred_uid_trusted', exactSessionMeta, createdMs };
  }

  // If Cloudflare provides no created timestamp, only trust exact liveSessionId metadata.
  if (!Number.isFinite(createdMs) || createdMs <= 0) {
    return exactSessionMeta
      ? { ok: true, uid, reason: 'exact_session_meta_no_created', exactSessionMeta, createdMs }
      : { ok: false, uid, reason: 'missing_created_timestamp', exactSessionMeta, createdMs };
  }
  if (Number.isFinite(startMs) && startMs > 0 && createdMs < startMs - skewMs) {
    return { ok: false, uid, reason: 'video_before_session_window', exactSessionMeta, createdMs };
  }
  if (Number.isFinite(endMs) && endMs > 0 && createdMs > endMs + afterEndMs) {
    return { ok: false, uid, reason: 'video_after_session_window', exactSessionMeta, createdMs };
  }

  return { ok: true, uid, reason: exactSessionMeta ? 'exact_session_meta' : 'time_window_match', exactSessionMeta, createdMs };
}

export function selectRtmpReplayVideoForSession(
  videos: Record<string, unknown>[] | null | undefined,
  session: Record<string, unknown>,
  preferredUid?: string | null,
  options: { skewSeconds?: number; afterEndMinutes?: number } = {},
): RtmpReplayVideoSelection {
  const rejected: Array<{ uid: string | null; reason: string }> = [];
  const list = Array.isArray(videos) ? videos : [];
  if (list.length === 0) return { video: null, uid: null, reason: 'no_videos', rejected, candidates: 0 };

  if (preferredUid) {
    const preferred = list.find((video) => getVideoUid(video) === String(preferredUid));
    if (preferred) {
      const validation = validateRtmpReplayVideoForSession(preferred, session, {
        ...options,
        preferredUid,
      });
      if (validation.ok) {
        return { video: preferred, uid: validation.uid, reason: validation.reason, rejected, candidates: 1 };
      }
      rejected.push({ uid: validation.uid, reason: validation.reason });
    }
  }

  const valid: Array<{
    video: Record<string, unknown>;
    uid: string;
    reason: string;
    exactSessionMeta: boolean;
    createdMs: number;
    durationSeconds: number | null;
    score: number;
  }> = [];
  const startMs = getSessionStartMs(session);
  const endMs = getSessionEndMs(session);
  const expectedDuration = getExpectedSessionDurationSeconds(session);
  for (const video of list) {
    const validation = validateRtmpReplayVideoForSession(video, session, options);
    if (validation.ok && validation.uid) {
      const durationSeconds = getVideoDurationSeconds(video);
      const startDistance = Number.isFinite(startMs) && validation.createdMs > 0 ? Math.abs(validation.createdMs - startMs) / 1000 : 30_000;
      const endDistance = Number.isFinite(endMs) && validation.createdMs > 0 ? Math.max(0, Math.abs(validation.createdMs - endMs) / 1000) : 0;
      const durationDistance = expectedDuration && durationSeconds ? Math.abs(durationSeconds - expectedDuration) : 900;
      const liveStateBonus = isStreamVideoReadyVod(video) || isStreamVideoPlayable(video) ? -500 : 0;
      const exactMetaBonus = validation.exactSessionMeta ? -10_000 : 0;
      // Lower score wins. Prefer exact metadata, then time-window videos whose duration resembles the session.
      const score = exactMetaBonus + liveStateBonus + startDistance + Math.min(durationDistance, 1_800) + Math.min(endDistance, 1_800) * 0.15;
      valid.push({
        video,
        uid: validation.uid,
        reason: validation.reason,
        exactSessionMeta: validation.exactSessionMeta,
        createdMs: validation.createdMs,
        durationSeconds,
        score,
      });
    } else {
      rejected.push({ uid: validation.uid, reason: validation.reason });
    }
  }

  if (valid.length === 0) {
    return { video: null, uid: null, reason: 'ambiguous_or_no_matching_video', rejected, candidates: 0 };
  }

  const exact = valid.filter((item) => item.exactSessionMeta);
  const pool = exact.length > 0 ? exact : valid;
  pool.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return (Number.isFinite(b.createdMs) ? b.createdMs : 0) - (Number.isFinite(a.createdMs) ? a.createdMs : 0);
  });
  if (pool.length > 1 && exact.length === 0) {
    const [best, second] = pool;
    const scoreGap = Math.abs(best.score - second.score);
    if (scoreGap < 30) {
      return {
        video: null,
        uid: null,
        reason: 'ambiguous_matching_videos_without_session_meta',
        rejected,
        candidates: pool.length,
        diagnostics: {
          best_uid: best.uid,
          second_uid: second.uid,
          best_score: best.score,
          second_score: second.score,
          score_gap: scoreGap,
        },
      };
    }
  }
  const selected = pool[0];
  return {
    video: selected.video,
    uid: selected.uid,
    reason: selected.exactSessionMeta ? selected.reason : `deterministic_${selected.reason}`,
    rejected,
    candidates: pool.length,
    diagnostics: {
      selected_score: selected.score,
      selected_created_ms: selected.createdMs,
      selected_duration_seconds: selected.durationSeconds,
      expected_duration_seconds: expectedDuration,
      total_valid_candidates: valid.length,
    },
  };
}

export interface RtmpLiveConnectionDetection {
  inputConnected: boolean;
  videoStreaming: boolean;
  connected: boolean;
  activeVideoUid: string | null;
  activeVideo: Record<string, unknown> | null;
  playableVideoUid: string | null;
  playableVideo: Record<string, unknown> | null;
  liveInput: Record<string, unknown> | null;
  videos: Record<string, unknown>[];
  /** true = Cloudflare xác nhận Live Input không còn tồn tại; null = chưa xác định */
  liveInputMissing: boolean | null;
  reason: 'active_video_found' | 'input_connected_no_video' | 'vod_ready_not_live' | 'input_disconnected' | 'cloudflare_soft_fail' | 'no_input_id' | 'live_input_missing';
  errors: string[];
  diagnostics: {
    liveInputIdExists: boolean;
    liveInputState: string;
    liveInputConnected: boolean;
    liveInputMissing?: boolean | null;
    videoStreaming: boolean;
    videoCount: number;
    selectedVideoUidExists: boolean;
    reason: string;
    errors: string[];
  };

}

export async function detectRtmpLiveConnection(
  session: Record<string, unknown>,
  options: { skewSeconds?: number; includePersistedVideoCheck?: boolean } = {},
): Promise<RtmpLiveConnectionDetection> {
  const skewSeconds = options.skewSeconds ?? 60;
  const includePersistedVideoCheck = options.includePersistedVideoCheck !== false;
  const inputId = typeof session.cloudflare_live_input_id === 'string' ? session.cloudflare_live_input_id : null;
  const errors: string[] = [];
  let liveInput: Record<string, unknown> | null = null;
  let videos: Record<string, unknown>[] = [];
  let activeVideo: Record<string, unknown> | null = null;
  let activeVideoUid: string | null = null;
  let hasReadyVod = false;

  if (!inputId) {
    return {
      inputConnected: false,
      videoStreaming: false,
      connected: false,
      activeVideoUid: null,
      activeVideo: null,
      playableVideoUid: null,
      playableVideo: null,
      liveInput: null,
      videos: [],
      liveInputMissing: null,
      reason: 'no_input_id',

      errors,
      diagnostics: {
        liveInputIdExists: false,
        liveInputState: '',
        liveInputConnected: false,
        videoStreaming: false,
        videoCount: 0,
        selectedVideoUidExists: false,
        reason: 'no_input_id',
        errors,
      },
    };
  }

  const inputProbe = await checkStreamLiveInputExists(inputId);
  liveInput = inputProbe.input;
  const liveInputMissing = inputProbe.exists === false ? true : (inputProbe.exists === true ? false : null);
  if (inputProbe.exists === false) {
    errors.push('getStreamLiveInput: live_input_missing (404)');
  } else if (inputProbe.exists === null && inputProbe.error) {
    errors.push(`getStreamLiveInput: ${inputProbe.error}`);
  }
  const inputConnected = isLiveInputConnected(liveInput);


  let playableVideo: Record<string, unknown> | null = null;
  let playableVideoUid: string | null = null;

  const persistedUid = includePersistedVideoCheck && typeof session.cloudflare_video_uid === 'string' && session.cloudflare_video_uid
    ? String(session.cloudflare_video_uid)
    : null;
  if (persistedUid) {
    const persistedVideo = await getStreamVideo(persistedUid).catch((err) => {
      errors.push(`getStreamVideo(${persistedUid}): ${err?.message || String(err)}`);
      return null;
    });
    hasReadyVod = hasReadyVod || isStreamVideoReadyVod(persistedVideo);
    if (persistedVideo && isStreamVideoActivelyLive(persistedVideo)) {
      activeVideo = persistedVideo;
      activeVideoUid = persistedUid;
    }
    if (persistedVideo && isStreamVideoPlayable(persistedVideo)) {
      playableVideo = persistedVideo;
      playableVideoUid = persistedUid;
    }
  }

  videos = await listStreamLiveInputVideos(inputId).catch((err) => {
    errors.push(`listStreamLiveInputVideos: ${err?.message || String(err)}`);
    return [] as Record<string, unknown>[];
  });
  hasReadyVod = hasReadyVod || videos.some((video) => isStreamVideoReadyVod(video));

  const sessionStartedAt = persistedUid ? null : (session.armed_at || session.created_at || null);

  if (!activeVideo) {
    activeVideo = selectActiveLiveVideo(videos, sessionStartedAt as string | Date | null, skewSeconds);
    const uid = activeVideo ? (activeVideo as { uid?: unknown }).uid : null;
    activeVideoUid = uid ? String(uid) : null;
  }

  if (activeVideo && !playableVideo) {
    playableVideo = activeVideo;
    playableVideoUid = activeVideoUid;
  }
  if (!playableVideo) {
    playableVideo = selectPlayableLiveVideo(videos, sessionStartedAt as string | Date | null, skewSeconds);
    const uid = playableVideo ? (playableVideo as { uid?: unknown }).uid : null;
    playableVideoUid = uid ? String(uid) : null;
  }

  const videoStreaming = !!activeVideo;
  const cloudflareSoftFail = !liveInputMissing && errors.some((item) =>
    item.startsWith('getStreamLiveInput:') || item.startsWith('listStreamLiveInputVideos:')
  );
  const connected = inputConnected;
  const reason: RtmpLiveConnectionDetection['reason'] = inputConnected && videoStreaming
    ? 'active_video_found'
    : inputConnected
      ? 'input_connected_no_video'
      : liveInputMissing
        ? 'live_input_missing'
        : hasReadyVod
          ? 'vod_ready_not_live'
          : cloudflareSoftFail
            ? 'cloudflare_soft_fail'
            : 'input_disconnected';
  const diagnostics = {
    liveInputIdExists: true,
    liveInputState: getLiveInputState(liveInput),
    liveInputConnected: inputConnected,
    liveInputMissing,
    videoStreaming,
    videoCount: videos.length,
    selectedVideoUidExists: !!activeVideo,
    reason,
    errors,
  };

  return {
    inputConnected,
    videoStreaming,
    connected,
    activeVideoUid,
    activeVideo,
    playableVideoUid,
    playableVideo,
    liveInput,
    videos,
    liveInputMissing,
    reason,
    errors,
    diagnostics,
  };

}

