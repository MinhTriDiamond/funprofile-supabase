/* eslint-disable @typescript-eslint/no-explicit-any */

import { detectRtmpLiveConnection } from './cloudflareStreamService.ts';
import { endRtmpLiveSession, type RtmpEndResult } from './rtmpEndLiveService.ts';
import { isEligibleRtmpSessionForNoVideoGrace, reconcileRtmpNoVideoGrace, type RtmpNoVideoGraceResult, type RtmpVideoSignalObservation } from './rtmpDisconnectPolicy.ts';

const ACTIVE_RTMP_STATUSES = [
  'source_connected',
  'ready_to_go_live',
  'live',
  'disconnect_grace',
  'reconnecting',
];

function statusAfterVideoRecovery(session: Record<string, any>): string {
  if (session.status === 'live') return 'live';
  if (['disconnect_grace', 'reconnecting'].includes(String(session.status || ''))
    && (session.post_id || session.live_post_id)) return 'live';
  return session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected';
}

function noVideoTransportPatch(session: Record<string, any>, now: string): Record<string, unknown> {
  return {
    status: statusAfterVideoRecovery(session),
    connection_status: 'connected',
    source_connected: true,
    last_disconnected_at: null,
    disconnected_at: null,
    signal_status: 'connected',
    signal_lost_at: null,
    reconnect_deadline_at: null,
    auto_end_reason: null,
    live_input_status: 'input_connected_no_video',
    last_connection_check_at: now,
    updated_at: now,
  };
}

export async function reconcileRtmpSessionVideoSignal(
  admin: any,
  session: Record<string, any>,
  observation: RtmpVideoSignalObservation,
  options: {
    now: string;
    graceSeconds: number;
    detect?: (session: Record<string, unknown>) => Promise<RtmpVideoSignalObservation>;
    end?: (session: Record<string, any>, reason: 'source_disconnected_no_active_video') => Promise<RtmpEndResult>;
  },
): Promise<RtmpNoVideoGraceResult & { endResult?: RtmpEndResult }> {
  let endResult: RtmpEndResult | undefined;
  const result = await reconcileRtmpNoVideoGrace({
    observation,
    videoSignalLostAt: session.video_signal_lost_at,
    eligibleForGrace: isEligibleRtmpSessionForNoVideoGrace(session),
    now: options.now,
    graceSeconds: options.graceSeconds,
    persistNoVideoSince: (at) => persistRtmpVideoSignalLostAt(
      admin,
      String(session.id),
      at,
      options.now,
      noVideoTransportPatch(session, options.now),
    ),
    noteInputConnectedNoVideo: async () => {
      await updateActiveRtmpVideoSignal(admin, String(session.id), noVideoTransportPatch(session, options.now));
    },
    recoverVideo: async () => {
      await updateActiveRtmpVideoSignal(admin, String(session.id), {
        ...noVideoTransportPatch(session, options.now),
        status: statusAfterVideoRecovery(session),
        live_input_status: 'live',
        last_source_seen_at: options.now,
        video_signal_lost_at: null,
      });
    },
    finalCheck: () => {
      const detect = options.detect || ((row: Record<string, unknown>) => detectRtmpLiveConnection(row, { skewSeconds: 60 }));
      return detect(session);
    },
    endSession: async () => {
      const end = options.end || ((row, reason) => endRtmpLiveSession(admin, row, reason));
      endResult = await end({ ...session, video_signal_lost_at: session.video_signal_lost_at || options.now }, 'source_disconnected_no_active_video');
    },
  });
  return { ...result, ...(endResult ? { endResult } : {}) };
}

/** Store the first no-current-video observation without extending an active grace. */
export async function persistRtmpVideoSignalLostAt(
  admin: any,
  sessionId: string,
  lostAt: string,
  observedAt: string,
  additionalPatch: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from('live_sessions')
    .update({
      ...additionalPatch,
      video_signal_lost_at: lostAt,
      live_input_status: 'input_connected_no_video',
      last_connection_check_at: observedAt,
      updated_at: observedAt,
    })
    .eq('id', sessionId)
    .is('ended_at', null)
    .is('video_signal_lost_at', null)
    .in('status', ACTIVE_RTMP_STATUSES)
    .select('video_signal_lost_at')
    .maybeSingle();
  if (error) throw error;
  if (data?.video_signal_lost_at) return String(data.video_signal_lost_at);

  // Another watchdog may have won the null-to-timestamp update. Reuse its anchor.
  const { data: current, error: readError } = await admin
    .from('live_sessions')
    .select('video_signal_lost_at, ended_at, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (readError) throw readError;
  if (current?.video_signal_lost_at) return String(current.video_signal_lost_at);
  throw new Error('RTMP session is no longer eligible for no-video grace');
}

/** Apply a video-recovery patch only while the RTMP session is still active. */
export async function updateActiveRtmpVideoSignal(
  admin: any,
  sessionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await admin
    .from('live_sessions')
    .update(patch)
    .eq('id', sessionId)
    .is('ended_at', null)
    .in('status', ACTIVE_RTMP_STATUSES)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('RTMP session is no longer active for video recovery');
}
