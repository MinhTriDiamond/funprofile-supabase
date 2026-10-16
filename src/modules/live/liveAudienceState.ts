export type LiveAudienceState = 'loading' | 'live' | 'reconnecting' | 'ended' | 'processing_replay' | 'replay_ready' | 'failed';

export interface LiveAudienceStateInput {
  loading: boolean;
  resolving: boolean;
  hasSessionId: boolean;
  hasSession: boolean;
  status?: string | null;
  archiveStatus?: string | null;
  replayUrl?: string | null;
  isRtmp: boolean;
  paused: boolean;
  hasRemoteVideo: boolean;
}

export function resolveLiveAudienceState(input: LiveAudienceStateInput): LiveAudienceState {
  if (input.loading || input.resolving || !input.hasSessionId) return 'loading';
  if (!input.hasSession) return 'failed';
  if (input.status === 'failed' || input.archiveStatus === 'failed') return 'failed';

  // A stale replay URL must not hide a live reconnect attempt or an end in progress.
  if (input.status === 'disconnect_grace' || input.status === 'reconnecting') return 'reconnecting';
  if (input.status === 'ending') return 'processing_replay';
  if (input.status === 'live') {
    if (!input.isRtmp && !input.paused && !input.hasRemoteVideo) return 'reconnecting';
    return 'live';
  }

  if (input.replayUrl) return 'replay_ready';
  if (['processing', 'processing_replay', 'archiving', 'processing_stream', 'replay_temp_ready'].includes(String(input.status || ''))) {
    return 'processing_replay';
  }
  if (input.status === 'ended') return 'processing_replay';
  return 'ended';
}
