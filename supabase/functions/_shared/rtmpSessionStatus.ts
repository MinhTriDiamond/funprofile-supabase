export const RTMP_FROZEN_STATUSES = [
  'ended',
  'replay_temp_ready',
  'archiving_r2',
  'r2_ready',
  'stream_delete_pending',
  'processing_stream',
  'stream_ready',
  'exporting_mp4',
  'uploading_r2',
  'verifying_r2',
  'archived',
  'archiving',
  'processing',
  'processing_replay',
  'replay_posted',
  'stream_deleted',
  'posted',
  'failed',
] as const;

const RTMP_FROZEN_STATUS_SET = new Set<string>(RTMP_FROZEN_STATUSES);

export function isRtmpFrozenStatus(status: string | null | undefined): boolean {
  return !!status && RTMP_FROZEN_STATUS_SET.has(status);
}

export function isRtmpSessionEndedOrFrozen(session: { status?: string | null; ended_at?: string | null }): boolean {
  return !!session.ended_at || isRtmpFrozenStatus(session.status);
}

export function rtmpFrozenStatusSqlList(): string {
  return `(${RTMP_FROZEN_STATUSES.map((status) => `"${status}"`).join(',')})`;
}
