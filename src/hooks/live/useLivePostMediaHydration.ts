import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getWebcamLiveStatus, resolveLiveRouteId, type LiveRouteResolution } from '@/modules/live/liveService';
import type { PostData, PostMetadata } from '@/components/feed/types';
import { getPostPlayback } from '@/components/feed/postPlaybackResolver';
import { isLiveLikePost } from '@/components/feed/livePostDetection';
import { isFreshLiveSession } from '@/modules/live/utils/liveSessionFreshness';

type ReplayRow = {
  id?: string | null;
  live_session_id?: string | null;
  replay_post_id?: string | null;
  status?: string | null;
  replay_status?: string | null;
  playback_mp4?: string | null;
  r2_video_url?: string | null;
  archive_mp4_url?: string | null;
  playback_hls?: string | null;
  temp_hls_url?: string | null;
  archive_status?: string | null;
  thumbnail_url?: string | null;
  error_message?: string | null;
};

type WebcamStatusSnapshot = {
  status?: 'live' | 'stopping' | 'processing' | 'ready' | 'failed' | null;
  raw_status?: string | null;
  recording_status?: string | null;
  replay_status?: string | null;
  archive_status?: string | null;
  replay_url?: string | null;
  thumbnail_url?: string | null;
  error_message?: string | null;
};

export interface LivePostMediaHydration {
  isLiveLike: boolean;
  resolvedRoute: LiveRouteResolution | null;
  replay: ReplayRow | null;
  metadata: PostMetadata | null | undefined;
  finalVideoUrl: string | null;
  liveSessionId: string | null;
  failed: boolean;
  processingMessage: string | null;
  renderDecision: 'render_video' | 'render_live' | 'render_processing' | 'render_failed' | 'not_live';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isHlsUrl = (url?: string | null): boolean => !!url && /\.m3u8(?:\?|$)/i.test(url);

const firstNonHlsString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() && !isHlsUrl(value)) return value;
  }
  return null;
};

const isLiveStatus = (status?: string | null): boolean =>
  status === 'live' || status === 'reconnecting' || status === 'disconnect_grace';

function isLiveCandidate(post: PostData, metadata?: PostMetadata | null): boolean {
  return isLiveLikePost(post as unknown as Record<string, unknown>, metadata as Record<string, unknown> | null | undefined);
}

function routeArchiveUrl(route?: LiveRouteResolution | null): string | null {
  return firstNonHlsString(
    route?.archive_url,
    route?.r2_video_url,
    route?.replay_url,
    route?.playback_url,
  );
}

function replayArchiveUrl(replay?: ReplayRow | null): string | null {
  return firstNonHlsString(
    replay?.archive_mp4_url,
    replay?.r2_video_url,
    replay?.playback_mp4,
  );
}

export function useLivePostMediaHydration(post: PostData): LivePostMediaHydration {
  const baseMetadata = post.metadata;
  const [resolvedRoute, setResolvedRoute] = useState<LiveRouteResolution | null>(null);
  const [replay, setReplay] = useState<ReplayRow | null>(null);
  const [webcamStatus, setWebcamStatus] = useState<WebcamStatusSnapshot | null>(null);
  const liveCandidate = isLiveCandidate(post, baseMetadata);
  const postAny = post as unknown as Record<string, unknown>;
  const rawLiveSessionId = typeof postAny.live_session_id === 'string'
    ? postAny.live_session_id
    : typeof baseMetadata?.live_session_id === 'string'
      ? baseMetadata.live_session_id
      : null;

  useEffect(() => {
    if (!post.id || !liveCandidate) {
      setResolvedRoute(null);
      setReplay(null);
      setWebcamStatus(null);
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      let route = await resolveLiveRouteId(rawLiveSessionId || post.id).catch(() => null);
      if (!route && rawLiveSessionId) {
        route = await resolveLiveRouteId(post.id).catch(() => null);
      }
      if (cancelled) return;
      setResolvedRoute(route);

      const sessionId = route?.live_session_id || rawLiveSessionId;
      let latestReplay: ReplayRow | null = null;

      if (sessionId && UUID_RE.test(sessionId)) {
        const { data } = await (supabase.from('live_replays' as any) as any)
          .select('id, live_session_id, replay_post_id, status, replay_status, playback_mp4, r2_video_url, archive_mp4_url, playback_hls, temp_hls_url, archive_status, thumbnail_url, error_message')
          .eq('live_session_id', sessionId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        latestReplay = data || null;
      }

      if (!latestReplay) {
        const replayPostIds = Array.from(new Set([
          post.id,
          route?.replay_post_id,
          route?.live_post_id,
          route?.post_id,
        ].filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))));

        for (const replayPostId of replayPostIds) {
          const { data } = await (supabase.from('live_replays' as any) as any)
            .select('id, live_session_id, replay_post_id, status, replay_status, playback_mp4, r2_video_url, archive_mp4_url, playback_hls, temp_hls_url, archive_status, thumbnail_url, error_message')
            .eq('replay_post_id', replayPostId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          latestReplay = data || null;
          if (latestReplay) break;
        }
      }

      if (!cancelled) setReplay(latestReplay);
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [post.id, liveCandidate, rawLiveSessionId]);

  const statusSessionId = replay?.live_session_id || resolvedRoute?.live_session_id || rawLiveSessionId;
  const knownReplayUrl = firstNonHlsString(replayArchiveUrl(replay), routeArchiveUrl(resolvedRoute));
  const isWebcamCandidate = liveCandidate && Boolean(statusSessionId) && (
    baseMetadata?.live_mode === 'agora_webcam'
    || baseMetadata?.recording_provider === 'agora'
    || baseMetadata?.source === 'agora_webcam'
    || Boolean(rawLiveSessionId && !baseMetadata?.cloudflare_live_input_id)
  );

  useEffect(() => {
    if (!isWebcamCandidate || !statusSessionId || !UUID_RE.test(statusSessionId) || knownReplayUrl) {
      setWebcamStatus(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const pollStatus = async () => {
      attempts += 1;
      try {
        const status = await getWebcamLiveStatus(statusSessionId);
        if (cancelled) return;
        setWebcamStatus(status as WebcamStatusSnapshot);

        if (status.status === 'ready' && status.replay_url) {
          window.dispatchEvent(new Event('invalidate-feed'));
          return;
        }

        if (status.status === 'failed' || attempts >= 40) return;
      } catch {
        if (cancelled || attempts >= 6) return;
      }

      timer = setTimeout(pollStatus, 15_000);
    };

    pollStatus();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    baseMetadata?.cloudflare_live_input_id,
    baseMetadata?.live_mode,
    baseMetadata?.recording_provider,
    baseMetadata?.source,
    isWebcamCandidate,
    knownReplayUrl,
    rawLiveSessionId,
    statusSessionId,
  ]);

  return useMemo(() => {
    const replayUrl = replayArchiveUrl(replay);
    const routeUrl = routeArchiveUrl(resolvedRoute);
    const statusUrl = firstNonHlsString(webcamStatus?.replay_url);
    const routeIsActiveLive = Boolean(
      resolvedRoute
      && isLiveStatus(resolvedRoute.status)
      && !resolvedRoute.ended_at,
    );
    const replayMetadata = replay
      ? (routeIsActiveLive && !replayUrl
        ? {
            replay_id: replay.id || (baseMetadata?.replay_id as string | undefined),
            live_session_id: replay.live_session_id || resolvedRoute?.live_session_id || rawLiveSessionId || undefined,
            thumbnail_url: replay.thumbnail_url || baseMetadata?.thumbnail_url,
          }
        : {
            replay_id: replay.id || (baseMetadata?.replay_id as string | undefined),
            live_session_id: replay.live_session_id || resolvedRoute?.live_session_id || rawLiveSessionId || undefined,
            replay_status: replayUrl || statusUrl ? 'ready_mp4' : (replay.replay_status || replay.status || baseMetadata?.replay_status),
            replay_ready: Boolean(replayUrl || statusUrl) || baseMetadata?.replay_ready === true,
            archive_status: replay.archive_status || webcamStatus?.archive_status || resolvedRoute?.archive_status || baseMetadata?.archive_status,
            archive_mp4_url: replay.archive_mp4_url || replayUrl || statusUrl || baseMetadata?.archive_mp4_url,
            r2_video_url: replay.r2_video_url || replayUrl || statusUrl || baseMetadata?.r2_video_url,
            playback_mp4: replay.playback_mp4 || replayUrl || statusUrl || baseMetadata?.playback_mp4,
            playback_provider: replayUrl || statusUrl ? 'r2' : baseMetadata?.playback_provider,
            playback_type: replayUrl || statusUrl ? 'mp4' : baseMetadata?.playback_type,
            thumbnail_url: replay.thumbnail_url || webcamStatus?.thumbnail_url || baseMetadata?.thumbnail_url,
            processing_message: replayUrl || statusUrl ? null : (replay.error_message || webcamStatus?.error_message || baseMetadata?.processing_message),
          })
      : {};
    const statusMetadata = !replay && statusUrl
      ? {
          live_session_id: resolvedRoute?.live_session_id || rawLiveSessionId || undefined,
          live_status: 'ended',
          replay_status: 'ready_mp4',
          replay_ready: true,
          archive_status: webcamStatus?.archive_status || 'r2_ready',
          archive_mp4_url: statusUrl,
          r2_video_url: statusUrl,
          playback_url: statusUrl,
          playback_mp4: statusUrl,
          playback_provider: 'r2',
          playback_type: 'mp4',
          thumbnail_url: webcamStatus?.thumbnail_url || baseMetadata?.thumbnail_url,
          processing_message: null,
        }
      : {};
    const mergedMetadata: PostMetadata | null | undefined = liveCandidate
      ? {
          ...(baseMetadata || {}),
          ...(resolvedRoute ? {
            live_session_id: resolvedRoute.live_session_id,
            live_status: isLiveStatus(resolvedRoute.status) ? 'live' : 'ended',
            status: resolvedRoute.status || undefined,
            host_connection_status: resolvedRoute.host_connection_status || undefined,
            last_seen_at: resolvedRoute.last_seen_at || undefined,
            last_host_heartbeat_at: resolvedRoute.last_host_heartbeat_at || undefined,
            ended_at: resolvedRoute.ended_at || undefined,
            end_reason: resolvedRoute.end_reason || undefined,
            recording_status: resolvedRoute.recording_status,
            archive_status: resolvedRoute.archive_status,
            archive_url: routeUrl,
            r2_video_url: resolvedRoute.r2_video_url || routeUrl,
            playback_url: routeUrl,
          } : {}),
          ...replayMetadata,
          ...statusMetadata,
        }
      : baseMetadata;

    const playback = getPostPlayback(
      { ...(post as unknown as Record<string, unknown>), metadata: mergedMetadata },
      {
        metadata: mergedMetadata,
        liveSession: resolvedRoute as unknown as Record<string, unknown> | null,
        liveReplay: replay as unknown as Record<string, unknown> | null,
        fallbackUrl: firstNonHlsString(replayUrl, routeUrl, statusUrl),
      },
    );
    const finalVideoUrl = playback.status === 'ready' ? playback.url : null;
    // `failed` chỉ bật khi recording/replay status chắc chắn fail.
    // archive_status='failed' đơn lẻ KHÔNG đủ — pipeline có thể vẫn còn temp R2
    // hoặc đang retry. Việc quyết định cuối cùng "không có bản ghi" do
    // `livePostFailureGuard.evaluateNoRecording` xử lý ở PostMedia.tsx.
    const failed = liveCandidate && !finalVideoUrl && (
      (post as any).replay_status === 'failed'
      || (post as any).replay_status === 'failed_no_recording'
      || mergedMetadata?.replay_status === 'failed'
      || mergedMetadata?.replay_status === 'failed_no_recording'
      || replay?.replay_status === 'failed'
      || replay?.replay_status === 'failed_no_recording'
      || webcamStatus?.status === 'failed'
    );

    const liveFresh = isFreshLiveSession({
      status: resolvedRoute?.status || (mergedMetadata?.status as string | undefined),
      live_status: (mergedMetadata?.live_status as string | undefined) || resolvedRoute?.status,
      host_connection_status: resolvedRoute?.host_connection_status || (mergedMetadata?.host_connection_status as string | undefined),
      last_seen_at: resolvedRoute?.last_seen_at || (mergedMetadata?.last_seen_at as string | undefined),
      last_host_heartbeat_at: resolvedRoute?.last_host_heartbeat_at || (mergedMetadata?.last_host_heartbeat_at as string | undefined),
      ended_at: resolvedRoute?.ended_at || (mergedMetadata?.ended_at as string | undefined),
    });
    const routeLiveGrace = routeIsActiveLive
      && ['online', ''].includes(String(resolvedRoute?.host_connection_status || mergedMetadata?.host_connection_status || '').toLowerCase());
    const activeLive = liveCandidate
      && !finalVideoUrl
      && !failed
      && (post.post_type === 'live')
      && (liveFresh || routeLiveGrace);
    const renderDecision = finalVideoUrl
      ? 'render_video'
      : failed
        ? 'render_failed'
        : activeLive
          ? 'render_live'
          : liveCandidate
            ? 'render_processing'
            : 'not_live';

    if (import.meta.env.DEV && liveCandidate) {
      // eslint-disable-next-line no-console
      console.debug('[LivePostMediaHydration]', {
        postId: post.id,
        post_type: post.post_type,
        metadata_live_session_id: baseMetadata?.live_session_id,
        resolved_session: resolvedRoute,
        replay,
        webcamStatus,
        finalVideoUrl,
        renderDecision,
        viewport: typeof window !== 'undefined' ? window.innerWidth : null,
      });
    }

    return {
      isLiveLike: liveCandidate || Boolean(resolvedRoute?.live_session_id),
      resolvedRoute,
      replay,
      metadata: mergedMetadata,
      finalVideoUrl,
      liveSessionId: replay?.live_session_id || resolvedRoute?.live_session_id || rawLiveSessionId || null,
      failed: Boolean(failed),
      processingMessage: finalVideoUrl
        ? null
        : failed
          ? 'Video đang xử lý lỗi, vui lòng thử lại sau'
          : 'Video đang được xử lý',
      renderDecision,
    };
  }, [baseMetadata, liveCandidate, post, rawLiveSessionId, replay, resolvedRoute, webcamStatus]);
}
