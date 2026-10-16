export interface RtmpDisconnectObservation {
  confirmedDisconnected: boolean;
  inputConnected: boolean;
  /** Chỉ true nếu Cloudflare xác nhận video live thuộc đúng cửa sổ phiên hiện tại. */
  currentSessionVideoStreaming: boolean;
  hasReadError: boolean;
}

export interface RtmpVideoSignalObservation {
  inputConnected: boolean;
  videoStreaming: boolean;
  confirmedDisconnected: boolean;
  errors?: readonly unknown[] | null;
  reason?: string | null;
}

export type RtmpVideoSignalState =
  | 'current_video'
  | 'input_connected_no_video'
  | 'input_disconnected'
  | 'unknown';

export function isEligibleRtmpSessionForNoVideoGrace(session: Record<string, unknown>): boolean {
  const status = typeof session.status === 'string' ? session.status : '';
  if (status === 'live') return true;
  return ['disconnect_grace', 'reconnecting'].includes(status)
    && Boolean(session.post_id || session.live_post_id);
}

export function classifyRtmpVideoSignal(observation: RtmpVideoSignalObservation): RtmpVideoSignalState {
  if (observation.errors?.length) return 'unknown';
  if (observation.videoStreaming) return 'current_video';
  if (observation.inputConnected) return 'input_connected_no_video';
  if (observation.confirmedDisconnected) return 'input_disconnected';
  return 'unknown';
}

export type RtmpNoVideoGraceResult = {
  action: 'recovered' | 'grace' | 'ended' | 'deferred' | 'input_disconnected' | 'ineligible';
  videoSignalLostAt: string | null;
  reason?: 'cloudflare_unknown' | 'final_check_failed' | 'final_check_unknown';
};

/**
 * Shared RTMP no-current-video grace transition. Callers provide their DB patch
 * and fenced end handler; provider errors and unknown states never end a session.
 */
export async function reconcileRtmpNoVideoGrace(args: {
  observation: RtmpVideoSignalObservation;
  videoSignalLostAt: string | null | undefined;
  eligibleForGrace: boolean;
  now: string;
  graceSeconds: number;
  persistNoVideoSince: (at: string) => Promise<string | void>;
  noteInputConnectedNoVideo?: (at: string) => Promise<void>;
  recoverVideo: () => Promise<void>;
  finalCheck: () => Promise<RtmpVideoSignalObservation>;
  endSession: () => Promise<void>;
}): Promise<RtmpNoVideoGraceResult> {
  const state = classifyRtmpVideoSignal(args.observation);
  if (state === 'unknown') {
    return { action: 'deferred', videoSignalLostAt: args.videoSignalLostAt || null, reason: 'cloudflare_unknown' };
  }
  if (state === 'current_video') {
    await args.recoverVideo();
    return { action: 'recovered', videoSignalLostAt: null };
  }
  if (state === 'input_disconnected') {
    return { action: 'input_disconnected', videoSignalLostAt: null };
  }
  if (!args.eligibleForGrace) {
    return { action: 'ineligible', videoSignalLostAt: args.videoSignalLostAt || null };
  }

  const nowMs = Date.parse(args.now);
  if (!Number.isFinite(nowMs)) throw new Error('Invalid no-video grace observation timestamp');
  const existingMs = args.videoSignalLostAt ? Date.parse(args.videoSignalLostAt) : NaN;
  let lostAt = Number.isFinite(existingMs) ? new Date(existingMs).toISOString() : args.now;
  if (!Number.isFinite(existingMs)) {
    const persistedAt = await args.persistNoVideoSince(lostAt);
    if (persistedAt) lostAt = persistedAt;
  }
  await args.noteInputConnectedNoVideo?.(lostAt);

  const graceSeconds = Number.isFinite(args.graceSeconds) ? Math.max(0, args.graceSeconds) : 180;
  const deadlineMs = Date.parse(lostAt) + graceSeconds * 1000;
  if (nowMs < deadlineMs) return { action: 'grace', videoSignalLostAt: lostAt };

  let finalObservation: RtmpVideoSignalObservation;
  try {
    finalObservation = await args.finalCheck();
  } catch {
    return { action: 'deferred', videoSignalLostAt: lostAt, reason: 'final_check_failed' };
  }
  const finalState = classifyRtmpVideoSignal(finalObservation);
  if (finalState === 'current_video') {
    await args.recoverVideo();
    return { action: 'recovered', videoSignalLostAt: null };
  }
  if (finalState === 'unknown') {
    return { action: 'deferred', videoSignalLostAt: lostAt, reason: 'final_check_unknown' };
  }

  await args.endSession();
  return { action: 'ended', videoSignalLostAt: lostAt };
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
