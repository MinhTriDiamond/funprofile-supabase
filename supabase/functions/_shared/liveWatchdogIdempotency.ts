// B5-B: chống vòng lặp watchdog trên phiên live đã kết thúc.
// Pure logic, không phụ thuộc Deno để Vitest test được trực tiếp.

export const TERMINAL_LIVE_STATUSES = new Set([
  'ended',
  'failed',
  'archived',
  'posted',
  'recording_failed',
]);

export interface WatchdogSessionLike {
  id?: string | null;
  status?: string | null;
  ended_at?: string | null;
  recording_status?: string | null;
  archive_status?: string | null;
}

/**
 * Phiên đã kết thúc thật sự (có ended_at, hoặc status/archive ở trạng thái cuối)
 * ⇒ watchdog KHÔNG được chọn làm ứng viên force-end nữa.
 */
export function isSettledLiveSession(session: WatchdogSessionLike | null | undefined): boolean {
  if (!session) return true;
  if (session.ended_at) return true;
  const status = String(session.status || '').toLowerCase();
  if (TERMINAL_LIVE_STATUSES.has(status)) return true;
  const archive = String(session.archive_status || '').toLowerCase();
  if (archive === 'replay_posted' || archive === 'r2_ready' || archive === 'unrecoverable') return true;
  return false;
}

/** Ứng viên force-end hợp lệ = chưa settled. */
export function shouldWatchdogForceEnd(session: WatchdogSessionLike | null | undefined): boolean {
  return !isSettledLiveSession(session);
}

/**
 * Chỉ ghi log `force_end_idempotent_return` LẦN ĐẦU cho mỗi phiên.
 * Các lần watchdog chạy lại sau đó không ghi thêm row nào.
 */
export function shouldLogIdempotentReturn(existingIdempotentEventCount: number): boolean {
  return (existingIdempotentEventCount || 0) === 0;
}
