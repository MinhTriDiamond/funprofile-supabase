/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getStreamPlaybackUrls, listStreamLiveInputVideos, selectRtmpReplayVideoForSession, setStreamLiveInputEnabled } from './cloudflareStreamService.ts';
import { isRtmpSessionEndedOrFrozen } from './rtmpSessionStatus.ts';
import { claimRtmpEndSession, commitFencedRtmpEnd, disableLiveInputWithConfirmation, finalizeClaimedRtmpEnd, readRtmpEndSession, retryRtmpLiveInputDisableCandidates, runClaimedRtmpEndTransition, RTMP_END_CLAIM_LEASE_MS } from './rtmpEndTransition.ts';
import { safeErrorText } from './safeErrorText.ts';

const PROCESSING_MESSAGE = 'Đang tối ưu video replay trong nền. Bạn vẫn có thể xem lại ngay.';

export type RtmpEndReason =
  | 'manual'
  | 'disconnect_timeout'
  | 'obs_signal_lost_timeout'
  | 'cloudflare_error'
  | 'admin_force'
  | 'duration_limit'
  | 'max_duration_exceeded'
  | 'source_disconnected_no_active_video'
  | 'host_clicked_end';

export interface RtmpEndResult {
  ended: boolean;
  idempotent: boolean;
  in_progress?: boolean;
  status?: string | null;
  end_reason?: string | null;
  ended_at?: string | null;
  cloudflare_video_uid: string | null;
  disable_error: string | null;
}

export function getObsReconnectTimeoutSeconds(): number {
  const raw = Number(Deno.env.get('OBS_RECONNECT_TIMEOUT_SECONDS') || '60');
  return Number.isFinite(raw) && raw > 0 ? raw : 60;
}

/**
 * Poll ngắn 8 lần × 1.5s để bắt UID của Cloudflare Live Input video sau khi user end live.
 * Cloudflare thường mất 2-8s để materialize VOD UID; nếu chỉ list 1 lần sẽ miss và phải chờ
 * cron 2 phút mới có instant replay post. Trả null nếu hết retry vẫn chưa có UID.
 */
async function pollLiveInputVideoForReplay(
  inputId: string,
  session: any,
  preferredUid: string | null | undefined,
  opts: { tries?: number; intervalMs?: number } = {},
): Promise<{ uid: string; video: any } | null> {
  const tries = Math.max(1, opts.tries ?? 8);
  const intervalMs = Math.max(250, opts.intervalMs ?? 1500);
  for (let i = 0; i < tries; i++) {
    const videos = await listStreamLiveInputVideos(inputId).catch(() => []);
    if (videos.length > 0) {
      const selection = selectRtmpReplayVideoForSession(videos as any, session, preferredUid, {
        skewSeconds: 60,
        afterEndMinutes: 10,
      });
      if (selection.video && selection.uid) {
        return { uid: selection.uid, video: selection.video };
      }
      console.warn('[RTMP_INSTANT_REPLAY_STRICT_SELECT_MISS]', {
        live_session_id: session?.id,
        live_input_id: inputId,
        preferredUid: preferredUid || null,
        reason: selection.reason,
        candidates: selection.candidates,
        rejected: selection.rejected.slice(0, 5),
      });
      // Ưu tiên video thuộc phiên hiện tại (created >= armed_at - 60s), sau đó fallback newest.
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function loadRtmpReplayForEnd(session: any): Promise<{ uid: string; video: any } | null> {
  if (!session.cloudflare_live_input_id) return null;
  const polled = await pollLiveInputVideoForReplay(
    session.cloudflare_live_input_id,
    session,
    session.cloudflare_video_uid || null,
    { tries: 8, intervalMs: 1500 },
  );
  const video = polled?.video || null;
  const uid = String(polled?.uid || '');
  if (!uid) {
    console.warn('[RTMP_INSTANT_REPLAY_NO_UID]', {
      live_session_id: session.id,
      live_input_id: session.cloudflare_live_input_id,
      armed_at: session.armed_at,
      hint: 'Cloudflare chưa materialize VOD; cron recoverMissingRtmpReplays sẽ retry.',
    });
    return null;
  }
  return { uid, video };
}

export async function endRtmpLiveSession(
  admin: SupabaseClient,
  session: any,
  reason: RtmpEndReason,
): Promise<RtmpEndResult> {
  if (isRtmpSessionEndedOrFrozen(session) && session.ended_at) {
    return {
      ended: true,
      idempotent: true,
      status: session.status,
      end_reason: session.end_reason || null,
      ended_at: session.ended_at || null,
      cloudflare_video_uid: session.cloudflare_video_uid || null,
      disable_error: session.live_input_disable_error || null,
    };
  }

  const now = new Date().toISOString();
  const claimToken = crypto.randomUUID();
  const staleClaimBefore = new Date(Date.now() - RTMP_END_CLAIM_LEASE_MS).toISOString();
  const postId = session.post_id || session.live_post_id || null;
  const shouldArchivePublicLive = session.status === 'live' || !!postId || (
    session.status === 'ending'
    && session.recording_status === 'processing'
    && session.archive_status === 'pending'
  );
  const claimLifecyclePatch = shouldArchivePublicLive
    ? {
        recording_status: 'processing',
        processing_started_at: session.processing_started_at || now,
        archive_status: 'pending',
      }
    : {};
  const makeIdempotentResult = (current: any): RtmpEndResult => ({
    ended: !!current && current.status !== 'ending' && (Boolean(current.ended_at) || isRtmpSessionEndedOrFrozen(current)),
    idempotent: true,
    in_progress: current?.status === 'ending' && !current?.ended_at,
    status: current?.status || null,
    end_reason: current?.end_reason || null,
    ended_at: current?.ended_at || null,
    cloudflare_video_uid: current?.cloudflare_video_uid || null,
    disable_error: current?.live_input_disable_error || null,
  });

  return runClaimedRtmpEndTransition<any, RtmpEndResult>({
    claim: () => claimRtmpEndSession(admin, session.id, claimToken, reason, now, staleClaimBefore, claimLifecyclePatch),
    readCurrent: () => readRtmpEndSession(admin, session.id),
    makeIdempotentResult,
    runSideEffects: async (claimedRow) => {
      const claimedSession = { ...session, ...claimedRow };
      const effectiveReason = claimedRow.end_reason || reason;
      const effectivePostId = claimedSession.post_id || claimedSession.live_post_id || postId;
      let disableResult = {
        disabledAt: claimedSession.live_input_disabled_at || null,
        error: null as string | null,
      };
      if (claimedSession.cloudflare_live_input_id && !disableResult.disabledAt) {
        disableResult = await disableLiveInputWithConfirmation(
          claimedSession.cloudflare_live_input_id,
          async (inputId) => setStreamLiveInputEnabled(inputId, false),
          now,
        );
        if (disableResult.error) {
          console.warn('[RTMP_END_LIVE_INPUT_DISABLE_FAILED]', {
            live_session_id: claimedSession.id,
            live_input_id: claimedSession.cloudflare_live_input_id,
            reason: effectiveReason,
            error: disableResult.error,
          });
        }
      }

      const replayVideo = shouldArchivePublicLive ? await loadRtmpReplayForEnd(claimedSession) : null;
      const uid = replayVideo?.uid || claimedSession.cloudflare_video_uid || null;
      const urls = uid ? getStreamPlaybackUrls(uid) : null;
      const nextStatus = effectiveReason === 'obs_signal_lost_timeout'
        ? 'ended'
        : (shouldArchivePublicLive && uid ? 'replay_temp_ready' : 'ended');
      const isAutoEnd = effectiveReason !== 'manual' && effectiveReason !== 'host_clicked_end';
      const endedAt = claimedSession.ended_at || now;
      const sessionPatch = {
        status: nextStatus,
        connection_status: 'ended',
        ended_at: endedAt,
        end_reason: effectiveReason,
        auto_end_reason: isAutoEnd ? effectiveReason : claimedSession.auto_end_reason ?? null,
        source_connected: false,
        last_disconnected_at: claimedSession.last_disconnected_at || now,
        signal_status: effectiveReason === 'obs_signal_lost_timeout' ? 'timeout_auto_end' : 'ended',
        signal_lost_at: claimedSession.signal_lost_at || (effectiveReason === 'obs_signal_lost_timeout' ? (claimedSession.last_disconnected_at || now) : claimedSession.signal_lost_at),
        reconnect_deadline_at: null,
        recording_status: shouldArchivePublicLive ? 'processing' : claimedSession.recording_status,
        processing_started_at: shouldArchivePublicLive ? (claimedSession.processing_started_at || now) : claimedSession.processing_started_at,
        archive_status: shouldArchivePublicLive ? 'pending' : claimedSession.archive_status,
        archive_error: null,
        playback_provider: shouldArchivePublicLive && uid ? 'cloudflare_temp' : claimedSession.playback_provider,
        storage_provider: shouldArchivePublicLive && uid ? 'cloudflare_stream' : claimedSession.storage_provider,
        playback_url: urls?.hls || claimedSession.playback_url,
        hls_url: urls?.hls || claimedSession.hls_url,
        cloudflare_video_uid: uid || claimedSession.cloudflare_video_uid,
        live_input_disabled_at: disableResult.disabledAt,
        live_input_disable_error: disableResult.error,
        is_input_armed: false,
        armed_session_token: null,
        last_armed_heartbeat_at: null,
        updated_at: now,
      };
      const postPatch = effectivePostId ? {
        post_type: 'live_replay',
        video_url: null,
        replay_status: 'processing',
        playback_provider: 'r2',
        replay_ready: false,
        processing_message: PROCESSING_MESSAGE,
        updated_at: now,
        metadata: {
          live_status: 'ended',
          live_mode: 'rtmp_obs',
          live_session_id: session.id,
          end_reason: effectiveReason,
          archive_status: 'pending',
          playback_url: null,
          playback_hls: null,
          playback_type: 'r2_pending',
          playback_provider: 'r2',
          storage_provider: 'r2',
          replay_status: 'processing',
          replay_ready: false,
          replay_source: 'r2_pending',
          cloudflare_playback_url: null,
          cloudflare_video_uid: uid,
          stream_uid: uid,
          processing_message: PROCESSING_MESSAGE,
        },
      } : null;
      const replayPatch = replayVideo && urls ? {
        user_id: claimedSession.owner_id || claimedSession.host_user_id || claimedSession.user_id,
        stream_uid: replayVideo.uid,
        cloudflare_video_uid: replayVideo.uid,
        playback_hls: urls.hls,
        playback_dash: urls.dash,
        playback_mp4: urls.mp4,
        cloudflare_playback_url: urls.hls,
        status: 'ready',
        processing_started_at: now,
        storage_provider: 'cloudflare_stream',
        playback_provider: 'cloudflare_temp',
        archive_status: 'pending',
        archive_error: null,
        cloudflare_vod_enabled: true,
        last_cf_response: replayVideo.video || null,
      } : null;

      const result = await finalizeClaimedRtmpEnd<RtmpEndResult>(() => commitFencedRtmpEnd(admin, {
          sessionId: claimedSession.id,
          claimToken,
          sessionPatch,
          postId: effectivePostId,
          postPatch,
          replayPatch,
        }).then((committed) => ({
          committed,
          value: {
            ended: true,
            idempotent: false,
            status: nextStatus,
            end_reason: effectiveReason,
            ended_at: endedAt,
            cloudflare_video_uid: uid,
            disable_error: disableResult.error,
          } satisfies RtmpEndResult,
        })),
        async () => makeIdempotentResult(await readRtmpEndSession(admin, claimedSession.id)),
      );
      if (result.idempotent) return result;

      console.log('[RTMP_END_LIVE_SESSION]', {
        live_session_id: claimedSession.id,
        reason: effectiveReason,
        hasPost: !!effectivePostId,
        hasCloudflareVideoUid: !!uid,
        inputDisabled: !!disableResult.disabledAt,
        disableError: !!disableResult.error,
      });

      return result;
    },
  });
}

export async function retryPendingRtmpLiveInputDisables(admin: SupabaseClient, limit = 30): Promise<{ attempted: number; disabled: number; failed: number; skippedInUse: number }> {
  const { data: pending, error } = await (admin as any)
    .from('live_sessions')
    .select('id, cloudflare_live_input_id, is_persistent_stream')
    .eq('mode', 'rtmp_obs')
    .not('ended_at', 'is', null)
    .not('cloudflare_live_input_id', 'is', null)
    .is('live_input_disabled_at', null)
    .order('updated_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const candidates = (pending || []) as Array<{ id: string; cloudflare_live_input_id: string; is_persistent_stream?: boolean | null }>;
  const inputIds = [...new Set(candidates.map((session) => session.cloudflare_live_input_id).filter(Boolean))];
  if (inputIds.length === 0) {
    return { attempted: 0, disabled: 0, failed: 0, skippedInUse: 0 };
  }

  // Persistent session metadata is immutable for this session and therefore
  // protects reused IDs without a check-to-Cloudflare race. The config query is
  // a second defense for stale/inconsistent session metadata. IDs allocated to
  // temporary sessions are unique and current creation paths never reassign
  // them; any active reference found below also fails closed.
  const { data: persistentConfigs, error: configError } = await (admin as any)
    .from('rtmp_stream_configs')
    .select('cloudflare_live_input_id')
    .eq('is_persistent', true)
    .is('deleted_at', null)
    .in('cloudflare_live_input_id', inputIds);
  if (configError) throw configError;

  // Fail closed for IDs currently attached to any non-ended session. Current
  // creation code allocates a fresh input per temporary session; persistent
  // reuse is covered by the durable config check above.
  const { data: activeSessions, error: activeError } = await (admin as any)
    .from('live_sessions')
    .select('cloudflare_live_input_id')
    .in('cloudflare_live_input_id', inputIds)
    .is('ended_at', null);
  if (activeError) throw activeError;

  const persistentInputIds = new Set<string>((persistentConfigs || [])
    .map((config: { cloudflare_live_input_id?: string | null }) => config.cloudflare_live_input_id)
    .filter((id: string | null | undefined): id is string => !!id));
  const activeInputIds = new Set<string>((activeSessions || [])
    .map((session: { cloudflare_live_input_id?: string | null }) => session.cloudflare_live_input_id)
    .filter((id: string | null | undefined): id is string => !!id));

  return retryRtmpLiveInputDisableCandidates(
    candidates,
    persistentInputIds,
    activeInputIds,
    async (inputId) => disableLiveInputWithConfirmation(
      inputId,
      async (id) => setStreamLiveInputEnabled(id, false),
      new Date().toISOString(),
    ),
    async (sessionId, result) => {
      const now = new Date().toISOString();
      const patch = result.disabledAt
        ? { live_input_disabled_at: result.disabledAt, live_input_disable_error: null, updated_at: now }
        : { live_input_disable_error: result.error, updated_at: now };
      const { error: updateError } = await (admin as any)
        .from('live_sessions')
        .update(patch)
        .eq('id', sessionId)
        .is('live_input_disabled_at', null);
      if (updateError) throw updateError;
    },
    async (sessionId) => {
      const { error: updateError } = await (admin as any)
        .from('live_sessions')
        .update({
          live_input_disable_error: 'Retry skipped because Live Input is still shared or in use.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .is('live_input_disabled_at', null);
      if (updateError) throw updateError;
    },
  );
}

export function getDisconnectGraceSeconds(): number {
  const raw = Number(Deno.env.get('RTMP_DISCONNECT_GRACE_SECONDS') || '180');
  return Number.isFinite(raw) && raw > 0 ? raw : 180;
}

export function getDisconnectGraceMinutes(): number {
  return Math.max(1, Math.ceil(getDisconnectGraceSeconds() / 60));
}

export function disconnectGraceExpired(lastDisconnectedAt: string | null | undefined, graceSeconds = getDisconnectGraceSeconds()): boolean {
  if (!lastDisconnectedAt) return false;
  const disconnectedAt = new Date(lastDisconnectedAt).getTime();
  if (!Number.isFinite(disconnectedAt)) return false;
  return Date.now() - disconnectedAt >= graceSeconds * 1000;
}
