/** Pure decisions shared by orchestration and deletion guards; no provider side effects. */
export const POST_VIDEO_PART_BYTES = 16 * 1024 * 1024;
export const POST_VIDEO_LIVE_RESERVE_MINUTES = 240;
export type PostVideoPhase = 'queued' | 'waiting_capacity' | 'importing' | 'encoding' | 'mp4_wait' | 'r2_init' | 'r2_upload' | 'r2_verify' | 'publishing' | 'stream_delete_pending' | 'complete' | 'failed' | 'cancelled' | 'needs_review' | 'not_beneficial';
export interface PostVideoJob { phase: PostVideoPhase }
export interface PostVideoFacts {
  sourceOwned: boolean; postExists: boolean; sourceUnchanged: boolean; isPublic: boolean;
  exportReady: boolean; r2Verified: boolean; outputSmaller: boolean; outputPublished: boolean;
  streamIsLive: boolean; streamOwned: boolean; streamStillReferenced: boolean; sourceVerified: boolean;
  streamReady?: boolean;
}
export interface PostVideoAction {
  type: 'wait' | 'import' | 'poll_encoding' | 'request_export' | 'copy_part' | 'verify_r2' | 'publish_r2' | 'delete_stream' | 'complete' | 'needs_review';
}
export function decidePostVideoAction(job: PostVideoJob, f: PostVideoFacts): PostVideoAction {
  const action = (type: PostVideoAction['type']): PostVideoAction => ({ type });
  if (!f.sourceOwned || !f.postExists || !f.sourceUnchanged) return action('needs_review');
  if (job.phase === 'complete') return action('complete');
  if (job.phase === 'stream_delete_pending' || job.phase === 'not_beneficial') {
    if (f.streamIsLive || !f.streamOwned) return action('needs_review');
    if (f.streamStillReferenced) return action('wait');
    const safeCopy = job.phase === 'not_beneficial' ? f.sourceVerified : f.r2Verified && f.outputPublished;
    return action(safeCopy ? 'delete_stream' : 'wait');
  }
  if (!f.isPublic) return action('needs_review');
  switch (job.phase) {
    case 'queued': case 'waiting_capacity': return action('import');
    case 'importing': return action('poll_encoding');
    case 'encoding': return action(f.streamReady ? 'request_export' : 'poll_encoding');
    case 'mp4_wait': return action(f.exportReady ? 'copy_part' : 'request_export');
    case 'r2_init': case 'r2_upload': return action('copy_part');
    case 'r2_verify': return action('verify_r2');
    case 'publishing':
      if (!f.outputSmaller) return action('needs_review');
      return action(f.r2Verified ? 'publish_r2' : 'wait');
    default: return action('wait');
  }
}
export function computePostVideoBudget(input: { limitMinutes: number; usedMinutes: number; reservedMinutes: number; liveReserveMinutes: number }): number {
  if (Object.values(input).some(v => !Number.isFinite(v) || v < 0)) return 0;
  const freeSeconds = Math.floor(input.limitMinutes * 60) - Math.ceil(input.usedMinutes * 60) - Math.ceil(input.reservedMinutes * 60) - Math.ceil(input.liveReserveMinutes * 60);
  return Math.max(0, freeSeconds) / 60;
}
