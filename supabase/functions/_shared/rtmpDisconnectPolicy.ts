export interface RtmpDisconnectObservation {
  confirmedDisconnected: boolean;
  inputConnected: boolean;
  /** Chỉ true nếu Cloudflare xác nhận video live thuộc đúng cửa sổ phiên hiện tại. */
  currentSessionVideoStreaming: boolean;
  hasReadError: boolean;
}

const CONFIRMED_DISCONNECTED_STATES = new Set([
  'disconnected', 'disconnect', 'not_connected', 'not connected', 'idle', 'offline',
  'ready', 'readytostream', 'ready_to_stream', 'pendingupload', 'queued', 'inprogress', 'in_progress',
]);

export function isConfirmedRtmpDisconnectedState(state: string): boolean {
  const normalized = state.trim().toLowerCase();
  return CONFIRMED_DISCONNECTED_STATES.has(normalized)
    || normalized.includes('disconnect')
    || normalized.includes('not_connected')
    || normalized.includes('not connected');
}

export function isVideoInRtmpSessionWindow(
  videoCreatedAt: string | null | undefined,
  sessionStartedAt: string | Date | null | undefined,
  skewSeconds = 60,
): boolean {
  const createdMs = videoCreatedAt ? Date.parse(videoCreatedAt) : NaN;
  const startMs = sessionStartedAt instanceof Date
    ? sessionStartedAt.getTime()
    : (sessionStartedAt ? Date.parse(String(sessionStartedAt)) : NaN);
  return Number.isFinite(createdMs)
    && Number.isFinite(startMs)
    && startMs > 0
    && createdMs >= startMs - Math.max(0, skewSeconds) * 1000;
}

/**
 * Cho phép tự kết thúc vì mất nguồn chỉ sau hai lần đọc độc lập, đều xác nhận
 * input disconnected. Lỗi/unknown state hoặc tín hiệu live hiện tại luôn giữ phiên.
 */
export function mayAutoEndRtmpDisconnect(
  first: RtmpDisconnectObservation,
  final: RtmpDisconnectObservation,
): boolean {
  return [first, final].every((observation) =>
    observation.confirmedDisconnected
    && !observation.inputConnected
    && !observation.currentSessionVideoStreaming
    && !observation.hasReadError
  );
}
