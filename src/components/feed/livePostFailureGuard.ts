/**
 * Guard quyết định khi nào FE được phép hiển thị
 * "Phiên live này không có bản ghi".
 *
 * Quy tắc (theo spec):
 *  - Tất cả URL playable đều falsy.
 *  - recording_status ∈ {failed, not_started} HOẶC archive_status = 'failed'.
 *  - KHÔNG còn bất kỳ tín hiệu processing nào (archiving, uploading, copying...).
 *  - Đã qua grace period 10 phút kể từ ended_at (fallback created_at).
 *
 * Nếu KHÔNG đủ 4 điều kiện trên → coi là "đang xử lý", không bao giờ
 * hiển thị "không có bản ghi".
 */

type Loose = Record<string, unknown> | null | undefined;

const URL_FIELDS = [
  'playback_url',
  'archive_url',
  'archive_mp4_url',
  'r2_video_url',
  'replay_url',
  'media_url',
  'video_url',
  'temp_hls_url',
  'playback_hls',
  'playback_mp4',
  'cloudflare_playback_url',
] as const;

const PROCESSING_STATUSES = new Set([
  'pending',
  'queued',
  'acquiring',
  'starting',
  'stopping',
  'ending',
  'processing',
  'recording_processing',
  'archiving',
  'archiving_r2',
  'copying',
  'uploading_r2',
  'verifying_r2',
  'exporting_mp4',
  'replay_temp_ready',
  'r2_ready',
  'processing_replay',
  'processing_stream',
  'stream_ready',
  'stream_delete_pending',
]);

const FAILED_RECORDING_STATUSES = new Set(['failed', 'not_started', 'recording_failed']);
const FAILED_ARCHIVE_STATUSES = new Set(['failed', 'unrecoverable']);

const GRACE_PERIOD_MS = 10 * 60 * 1000;

function str(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function pickUrl(source: Loose): string | null {
  if (!source) return null;
  for (const field of URL_FIELDS) {
    const value = source[field];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function hasAnyUrl(sources: Loose[]): boolean {
  return sources.some((src) => !!pickUrl(src));
}

function hasProcessingSignal(sources: Loose[]): boolean {
  for (const src of sources) {
    if (!src) continue;
    const candidates = [
      src.status,
      src.replay_status,
      src.recording_status,
      src.archive_status,
      src.live_status,
    ];
    if (candidates.some((value) => PROCESSING_STATUSES.has(str(value)))) return true;
  }
  return false;
}

function pickFirst(sources: Loose[], field: string): string {
  for (const src of sources) {
    if (!src) continue;
    const value = src[field];
    if (typeof value === 'string' && value) return value.toLowerCase();
  }
  return '';
}

function getEndedAtMs(sources: Loose[]): number | null {
  for (const src of sources) {
    if (!src) continue;
    const value = src.ended_at;
    if (typeof value === 'string') {
      const ts = Date.parse(value);
      if (!Number.isNaN(ts)) return ts;
    }
  }
  return null;
}

export interface NoRecordingGuardInput {
  post: Loose;
  metadata: Loose;
  liveSession: Loose;
  liveReplay: Loose;
  replayOverride: Loose;
  liveHydrationFailed?: boolean;
  now?: number;
}

export interface NoRecordingGuardResult {
  isDefinitelyNoRecording: boolean;
  reason: 'has_url' | 'still_processing' | 'within_grace' | 'no_failure_signal' | 'confirmed_failed';
}

export function evaluateNoRecording(input: NoRecordingGuardInput): NoRecordingGuardResult {
  const sources: Loose[] = [
    input.post,
    input.metadata,
    input.liveSession,
    input.liveReplay,
    input.replayOverride,
  ];

  // 1. Có bất kỳ URL nào → chắc chắn KHÔNG phải "không có bản ghi"
  if (hasAnyUrl(sources)) {
    return { isDefinitelyNoRecording: false, reason: 'has_url' };
  }

  // 2. Còn tín hiệu processing → đợi tiếp
  if (hasProcessingSignal(sources)) {
    return { isDefinitelyNoRecording: false, reason: 'still_processing' };
  }

  // 3. Phải có tín hiệu thất bại thật từ recording_status hoặc archive_status
  const recordingStatus = pickFirst(sources, 'recording_status') || pickFirst(sources, 'replay_status');
  const archiveStatus = pickFirst(sources, 'archive_status');
  const recordingFailed = FAILED_RECORDING_STATUSES.has(recordingStatus)
    || pickFirst(sources, 'replay_status') === 'failed_no_recording';
  const archiveFailed = FAILED_ARCHIVE_STATUSES.has(archiveStatus);
  const liveHydrationFailed = !!input.liveHydrationFailed;

  if (!recordingFailed && !archiveFailed && !liveHydrationFailed) {
    return { isDefinitelyNoRecording: false, reason: 'no_failure_signal' };
  }

  // 4. Grace period: < 10 phút kể từ ended_at (hoặc created_at) → vẫn đợi
  const now = input.now ?? Date.now();
  const endedAt = getEndedAtMs(sources);
  const createdAtRaw = (input.post && input.post.created_at) as string | undefined;
  const createdAt = typeof createdAtRaw === 'string' ? Date.parse(createdAtRaw) : NaN;
  const anchor = endedAt ?? (Number.isFinite(createdAt) ? createdAt : null);
  if (anchor !== null && now - anchor < GRACE_PERIOD_MS) {
    return { isDefinitelyNoRecording: false, reason: 'within_grace' };
  }

  return { isDefinitelyNoRecording: true, reason: 'confirmed_failed' };
}
