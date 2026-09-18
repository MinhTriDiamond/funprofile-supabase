export const LIVE_RECONNECT_GRACE_MS = 120_000;

export interface LiveFreshnessInput {
  status?: string | null;
  live_status?: string | null;
  host_connection_status?: string | null;
  last_seen_at?: string | null;
  last_host_heartbeat_at?: string | null;
  ended_at?: string | null;
  replay_status?: string | null;
  archive_status?: string | null;
}

function timestampMs(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function getLiveHeartbeatAgeMs(input: LiveFreshnessInput, nowMs = Date.now()): number | null {
  const seenMs = timestampMs(input.last_seen_at) ?? timestampMs(input.last_host_heartbeat_at);
  return seenMs === null ? null : Math.max(0, nowMs - seenMs);
}

export function isFreshLiveSession(input: LiveFreshnessInput, nowMs = Date.now()): boolean {
  if (input.ended_at) return false;
  const status = String(input.status || input.live_status || '').toLowerCase();
  if (status !== 'live') return false;
  const connection = String(input.host_connection_status || '').toLowerCase();
  if (connection && connection !== 'online') return false;
  const ageMs = getLiveHeartbeatAgeMs(input, nowMs);
  return ageMs !== null && ageMs <= LIVE_RECONNECT_GRACE_MS;
}

export function isReconnectingLiveSession(input: LiveFreshnessInput, nowMs = Date.now()): boolean {
  if (input.ended_at) return false;
  const status = String(input.status || input.live_status || '').toLowerCase();
  const connection = String(input.host_connection_status || '').toLowerCase();
  if (status === 'reconnecting' || connection === 'reconnecting') return true;
  const ageMs = getLiveHeartbeatAgeMs(input, nowMs);
  return status === 'live' && ageMs !== null && ageMs > LIVE_RECONNECT_GRACE_MS;
}

export function isTerminalLiveSession(input: LiveFreshnessInput): boolean {
  const status = String(input.status || input.live_status || '').toLowerCase();
  const replayStatus = String(input.replay_status || '').toLowerCase();
  const archiveStatus = String(input.archive_status || '').toLowerCase();
  return Boolean(input.ended_at)
    || ['ended', 'ending', 'recording_processing', 'recording_failed', 'failed'].includes(status)
    || ['ready', 'ready_mp4', 'processing', 'failed', 'failed_no_recording'].includes(replayStatus)
    || ['pending', 'processing', 'r2_ready', 'failed', 'unrecoverable'].includes(archiveStatus);
}
