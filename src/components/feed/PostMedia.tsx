import { useMemo, memo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { MediaGrid } from './MediaGrid';
import { ReplayPostMedia } from './ReplayPostMedia';
import { LivePostEmbed } from './LivePostEmbed';
import { HeartAnimation } from './HeartAnimation';
import { Radio } from 'lucide-react';
import type { PostData } from './types';
import { useLiveReplayStatus } from '@/hooks/live/useLiveReplayStatus';
import { useLivePostMediaHydration } from '@/hooks/live/useLivePostMediaHydration';
import { debugLivePost } from './livePostDebug';
import { getPostPlayback } from './postPlaybackResolver';
import { isLiveLikePost } from './livePostDetection';
import { evaluateNoRecording } from './livePostFailureGuard';
import { isFreshLiveSession, isReconnectingLiveSession } from '@/modules/live/utils/liveSessionFreshness';

interface PostMediaProps {
  post: PostData;
  showHeartAnimation: boolean;
  onHeartComplete: () => void;
  onDoubleTap: () => void;
}

export const PostMedia = memo(function PostMedia({
  post, showHeartAnimation, onHeartComplete, onDoubleTap,
}: PostMediaProps) {
  const { t } = useLanguage();
  const liveHydration = useLivePostMediaHydration(post);
  const baseMetadata = liveHydration.metadata ?? post.metadata;
  const postAny = post as unknown as Record<string, unknown>;
  const rawLiveSessionId = (postAny.live_session_id as string | undefined)
    || (baseMetadata?.live_session_id as string | undefined)
    || liveHydration.liveSessionId
    || null;
  const isLiveLike = liveHydration.isLiveLike
    || isLiveLikePost(postAny, baseMetadata as Record<string, unknown> | null | undefined);
  const liveStatusBase = (postAny.live_status as string | undefined) || (baseMetadata?.live_status as string | undefined);
  const isMislinkedRepairPending = isLiveLike && baseMetadata?.mislinked_video_repair_pending === true;
  const resolvedLiveRoute = liveHydration.resolvedRoute;
  const resolvedLiveSessionId = resolvedLiveRoute?.live_session_id ?? null;

  // Realtime hydrate replay: khi archive xong, hook trả về override (r2_video_url, replay_ready,...)
  // Gọi sớm cho MỌI post live chưa có MP4 R2, không chờ cache đảo sang ended —
  // tránh trường hợp feed-posts cache stale giữ live_status='live' vĩnh viễn.
  const baseMetadataPlaybackType = baseMetadata?.playback_type as string | undefined;
  const shouldHydrateReplay = isLiveLike
    && (baseMetadataPlaybackType !== 'mp4' || !baseMetadata?.archive_mp4_url);
  const replayOverride = useLiveReplayStatus(
    rawLiveSessionId || resolvedLiveSessionId || null,
    shouldHydrateReplay,
  );
  const metadata = useMemo(() => {
    const routeArchiveUrl = resolvedLiveRoute?.archive_url
      || resolvedLiveRoute?.r2_video_url
      || resolvedLiveRoute?.replay_url
      || resolvedLiveRoute?.playback_url
      || null;
    if (!replayOverride && !resolvedLiveRoute) return baseMetadata;
    return {
      ...(baseMetadata || {}),
      ...(resolvedLiveRoute ? {
        live_session_id: resolvedLiveRoute.live_session_id,
        live_status: resolvedLiveRoute.status === 'live' || resolvedLiveRoute.status === 'reconnecting' ? 'live' : 'ended',
        status: resolvedLiveRoute.status,
        host_connection_status: resolvedLiveRoute.host_connection_status,
        last_seen_at: resolvedLiveRoute.last_seen_at,
        last_host_heartbeat_at: resolvedLiveRoute.last_host_heartbeat_at,
        ended_at: resolvedLiveRoute.ended_at,
        end_reason: resolvedLiveRoute.end_reason,
        recording_status: resolvedLiveRoute.recording_status,
        archive_status: resolvedLiveRoute.archive_status,
        archive_url: routeArchiveUrl,
        r2_video_url: resolvedLiveRoute.r2_video_url || routeArchiveUrl,
        playback_url: routeArchiveUrl,
      } : {}),
      ...(replayOverride || {}),
    };
  }, [baseMetadata, replayOverride, resolvedLiveRoute]);
  const playback = useMemo(() => getPostPlayback(
    { ...postAny, metadata },
    {
      metadata,
      liveSession: resolvedLiveRoute as unknown as Record<string, unknown> | null,
      liveReplay: liveHydration.replay as unknown as Record<string, unknown> | null,
      replayOverride: replayOverride as unknown as Record<string, unknown> | null,
      fallbackUrl: liveHydration.finalVideoUrl,
    },
  ), [postAny, metadata, resolvedLiveRoute, liveHydration.replay, liveHydration.finalVideoUrl, replayOverride]);
  const resolvedArchiveUrl = playback.status === 'ready' ? playback.url : null;
  const isLive = isLiveLike || playback.type === 'live' || playback.type === 'live_replay';
  const resolvedRouteStatus = resolvedLiveRoute?.status;
  const hasEndedAt = Boolean(resolvedLiveRoute?.ended_at || metadata?.ended_at);
  const sessionStatusCandidates = [
    resolvedRouteStatus,
    metadata?.status,
    metadata?.live_status,
    liveStatusBase,
    postAny.status,
    postAny.live_status,
  ].map((value) => String(value || '').toLowerCase());
  const sessionLooksOpen = !hasEndedAt
    && sessionStatusCandidates.some((status) => status === 'live' || status === 'reconnecting' || status === 'disconnect_grace');
  const hostConnectionStatus = String(
    resolvedLiveRoute?.host_connection_status || metadata?.host_connection_status || '',
  ).toLowerCase();
  const liveFreshnessInput = {
    status: resolvedLiveRoute?.status || (metadata?.status as string | undefined),
    live_status: sessionLooksOpen ? 'live' : liveStatusBase,
    host_connection_status: resolvedLiveRoute?.host_connection_status || (metadata?.host_connection_status as string | undefined),
    last_seen_at: resolvedLiveRoute?.last_seen_at || (metadata?.last_seen_at as string | undefined),
    last_host_heartbeat_at: resolvedLiveRoute?.last_host_heartbeat_at || (metadata?.last_host_heartbeat_at as string | undefined),
    ended_at: resolvedLiveRoute?.ended_at || (metadata?.ended_at as string | undefined),
  };
  const heartbeatFresh = isFreshLiveSession(liveFreshnessInput);
  const liveStatusGrace = sessionLooksOpen && (hostConnectionStatus === 'online' || !hostConnectionStatus);

  // Override có thể bơm replay_status / archive_status → tự suy ra ended dù cache stale.
  const overrideIndicatesEnded = !!replayOverride
    && !sessionLooksOpen
    && (replayOverride.replay_status === 'ready_mp4'
      || replayOverride.replay_status === 'ready_hls'
      || replayOverride.replay_status === 'archiving'
      || replayOverride.replay_status === 'processing'
      || replayOverride.replay_status === 'failed'
      || replayOverride.replay_status === 'failed_no_recording'
      || replayOverride.replay_ready === true
      || replayOverride.archive_status === 'archived');
  const liveStatus = sessionLooksOpen && playback.status !== 'ready'
    ? 'live'
    : playback.status === 'ready' || playback.status === 'processing' || playback.status === 'failed'
      ? 'ended'
      : playback.status === 'live'
        ? 'live'
        : overrideIndicatesEnded ? 'ended' : liveStatusBase;
  // Safety ceiling: post `live` quá 15 phút mà chưa có override replay
  // thì FE coi như đã ended (processing_replay) để không kẹt nhãn "Đang LIVE"
  // mãi mãi khi backend stuck. Backend cron stuck-promoter sẽ sync trong vòng 1 phút.
  const postAgeMs = Date.now() - new Date(post.created_at).getTime();
  const exceedsLiveCeiling = postAgeMs > 15 * 60_000 && !sessionLooksOpen;
  const routeIndicatesProcessing = !sessionLooksOpen && (resolvedRouteStatus === 'recording_processing'
    || resolvedRouteStatus === 'recording_failed'
    || resolvedRouteStatus === 'ending'
    || resolvedRouteStatus === 'ended'
    || resolvedLiveRoute?.recording_status === 'processing'
    || resolvedLiveRoute?.recording_status === 'failed');
  const isPotentialActiveLive = isLive
    && !resolvedArchiveUrl
    && !routeIndicatesProcessing
    && !exceedsLiveCeiling
    && (playback.status === 'live' || sessionLooksOpen)
    && (heartbeatFresh || liveStatusGrace);
  const isEndedLive = isLive && !isPotentialActiveLive && (
    playback.status === 'ready'
    || playback.status === 'processing'
    || playback.status === 'failed'
    || liveStatus === 'ended'
    || post.post_type === 'live_replay'
    || overrideIndicatesEnded
    || !!resolvedArchiveUrl
    || routeIndicatesProcessing
    || exceedsLiveCeiling
  );
  const isActiveLive = isPotentialActiveLive;
  const isReconnectingLive = isLive
    && !isActiveLive
    && !resolvedArchiveUrl
    && isReconnectingLiveSession(liveFreshnessInput);

  const colReplayReady = postAny.replay_ready === true;
  const colReplayStatus = postAny.replay_status as string | undefined;
  const colPlaybackProvider = postAny.playback_provider as string | undefined;
  const colProcessingMsg = postAny.processing_message as string | undefined;
  const metadataReplayStatus = metadata?.replay_status as string | undefined;
  const metadataPlaybackType = metadata?.playback_type as string | undefined;
  const isAgoraWebcamReplay = metadata?.live_mode === 'agora_webcam' || metadata?.recording_provider === 'agora';

  const isR2ReplayReady = isEndedLive
    && (colReplayStatus === 'ready_mp4'
      || metadataReplayStatus === 'ready_mp4'
      || !!resolvedArchiveUrl
      || (colReplayReady || metadata?.replay_ready === true || colReplayStatus === 'ready' || metadataReplayStatus === 'ready' || metadata?.archive_status === 'archived'))
    && (!!resolvedArchiveUrl || colPlaybackProvider === 'r2' || metadata?.playback_provider === 'r2' || metadataPlaybackType === 'mp4' || metadataPlaybackType === 'r2')
    && !!(metadata?.archive_mp4_url || metadata?.r2_video_url || metadata?.playback_mp4 || metadata?.playback_url || post.video_url || resolvedArchiveUrl);
  const isTempReplayReady = !isAgoraWebcamReplay && isEndedLive
    && (colReplayStatus === 'ready_hls'
      || colReplayStatus === 'archiving'
      || metadataReplayStatus === 'ready_hls'
      || metadataReplayStatus === 'archiving'
      || (colReplayReady || metadata?.replay_ready === true || colReplayStatus === 'ready' || metadataReplayStatus === 'ready'))
    && (colPlaybackProvider === 'r2_temp'
      || colPlaybackProvider === 'cloudflare_temp'
      || metadata?.playback_provider === 'r2_temp'
      || metadata?.playback_provider === 'cloudflare_temp'
      || metadataPlaybackType === 'hls'
      || metadataPlaybackType === 'cloudflare_temp')
    && !!(metadata?.temp_hls_url || metadata?.cloudflare_playback_url || metadata?.playback_hls || metadata?.playback_url || post.video_url);

  const archiveStatus = metadata?.archive_status as string | undefined;
  const replayStatusIsPlayable = colReplayStatus === 'ready_mp4'
    || colReplayStatus === 'ready_hls'
    || colReplayStatus === 'archiving'
    || metadataReplayStatus === 'ready_mp4'
    || metadataReplayStatus === 'ready_hls'
    || metadataReplayStatus === 'archiving';
  const hasReplayPlayableUrl = !!(
    metadata?.archive_mp4_url
    || metadata?.r2_video_url
    || metadata?.playback_mp4
    || metadata?.temp_hls_url
    || metadata?.playback_hls
    || metadata?.playback_url
    || post.video_url
    || resolvedArchiveUrl
  );
  // "Definitely no recording" guard: chỉ true khi backend xác nhận thất bại HOÀN
  // TOÀN — mọi URL null, không còn tín hiệu processing, qua grace period 10 phút.
  // Mọi tình huống khác đều coi là "đang xử lý".
  const noRecordingResult = evaluateNoRecording({
    post: postAny,
    metadata: metadata as Record<string, unknown> | null,
    liveSession: resolvedLiveRoute as unknown as Record<string, unknown> | null,
    liveReplay: liveHydration.replay as unknown as Record<string, unknown> | null,
    replayOverride: replayOverride as unknown as Record<string, unknown> | null,
    liveHydrationFailed: liveHydration.failed,
  });
  const isDefinitelyNoRecording = noRecordingResult.isDefinitelyNoRecording;
  // Giữ biến cũ cho các nhánh tham chiếu (vd. replayStatusText), nhưng KHÔNG dùng
  // để quyết định render "Phiên live này không có bản ghi" nữa.
  const isFailedReplay = isDefinitelyNoRecording;
  void replayStatusIsPlayable; void hasReplayPlayableUrl; void archiveStatus;
  const archiveProgressPercent = typeof metadata?.archive_progress_percent === 'number'
    ? Math.max(0, Math.min(99, Math.round(metadata.archive_progress_percent)))
    : null;
  const replayStatusText = colProcessingMsg
    || (metadata?.processing_message as string | undefined)
    || liveHydration.processingMessage
    || (isFailedReplay
      ? t('pmedNoRecording')
      : t('pmedProcessingRecording'));


  const isChunkedManifestUrl = (url?: string | null): url is string =>
    !!url && (url.endsWith('manifest.json') || /\/recordings\/[^/]+\/manifest\.json(?:\?|$)/.test(url));

  // Cloudflare Stream thumbnails (customer-*.cloudflarestream.com/<uid>/thumbnails/...)
  // hết hiệu lực sau khi archive sang R2 → 404 làm hỏng poster UI.
  const isBrokenCloudflareThumb = (url?: string | null): boolean => {
    if (!url) return false;
    return /customer-[a-z0-9]+\.cloudflarestream\.com\/[^/]+\/thumbnails\//i.test(url);
  };

  const mediaItems = useMemo(() => {
    // Default an toàn: webcam/RTMP replay không có recording_layout (data cũ trước migration
    // hoặc edge insert lúc schema cache lệch) → mặc định landscape 16:9 thay vì square,
    // tránh letterbox đen 2 bên khi replay desktop hiển thị như mobile dọc.
    const liveReplayAspectRatio: 'landscape_16_9' | 'portrait_9_16' =
      metadata?.recording_layout === 'portrait_9_16' ? 'portrait_9_16' : 'landscape_16_9';
    const items: Array<{
      url: string;
      type: 'image' | 'video';
      poster?: string;
      isLiveReplay?: boolean;
      aspectRatio?: 'landscape_16_9' | 'portrait_9_16' | 'square';
    }> = [];

    // Ưu tiên MP4 R2 (durable, CORS OK trên mọi trình duyệt).
    const liveVideoUrl = isLive && (playback.status === 'ready' || playback.status === 'live')
      ? playback.url || undefined
      : undefined;
    const chunkedFallbackUrl = isChunkedManifestUrl(liveVideoUrl) ? liveVideoUrl : undefined;

    // Thứ tự ưu tiên replay đã kết thúc: post.video_url (MP4 đã scrub) → r2_video_url → tempReplay.
    const rawPoster = metadata?.thumbnail_url as string | undefined;
    // Bỏ poster nếu là Cloudflare Stream thumbnail (UID đã xoá sau archive → 404).
    const poster = isBrokenCloudflareThumb(rawPoster) ? undefined : rawPoster;

    if (isLive) {
      debugLivePost('LiveRenderDecision', {
        postId: post.id,
        postType: post.post_type,
        content: post.content,
        isLiveLike,
        route_status: resolvedLiveRoute?.status,
        resolvedRoute: resolvedLiveRoute,
        replay: liveHydration.replay,
        route_ended_at: resolvedLiveRoute?.ended_at,
        route_last_seen_at: resolvedLiveRoute?.last_seen_at,
        route_recording_status: resolvedLiveRoute?.recording_status,
        playbackStatus: playback.status,
        playbackType: playback.type,
        url: playback.url,
        sourceField: playback.sourceField,
        live_session_id: rawLiveSessionId || resolvedLiveSessionId,
        replay_status: colReplayStatus,
        replay_ready: colReplayReady,
        playback_provider: colPlaybackProvider,
        live_status: liveStatus,
        is_active_live: isActiveLive,
        is_reconnecting_live: isReconnectingLive,
        is_ended_live: isEndedLive,
        isR2ReplayReady,
        isTempReplayReady,
        hasChunkedFallback: !!chunkedFallbackUrl,
        render_decision: isActiveLive ? 'live_embed' : liveVideoUrl ? 'media_grid' : isFailedReplay ? 'failed_placeholder' : 'processing_placeholder',
        chosen_video_url: liveVideoUrl,
        resolved_archive_url: resolvedArchiveUrl,
        resolved_archive_source: playback.sourceField,
        should_render_video: !!liveVideoUrl || isActiveLive,
        viewport: typeof window !== 'undefined' ? window.innerWidth : null,
        r2_video_url: metadata?.r2_video_url,
        playback_url: metadata?.playback_url,
        playback_hls: metadata?.playback_hls,
        stream_uid: metadata?.stream_uid,
        thumbnail_url_raw: rawPoster,
        thumbnail_used: poster,
        thumbnail_dropped_404_cloudflare: !!rawPoster && !poster,
      });
    }

    if (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0) {
      if (isLive) {
        if (!liveVideoUrl) return [];
        const mappedMedia = post.media_urls.map(m => ({
          ...m,
          url: m.type === 'video' ? liveVideoUrl : m.url,
          isLiveReplay: m.type === 'video',
          poster: m.type === 'video' ? poster : undefined,
          aspectRatio: m.type === 'video' ? liveReplayAspectRatio : undefined,
        }));
        if (!mappedMedia.some((m) => m.type === 'video')) {
          mappedMedia.push({
            url: liveVideoUrl,
            type: 'video',
            isLiveReplay: true,
            poster,
            aspectRatio: liveReplayAspectRatio,
          });
        }
        return mappedMedia;
      }
      return post.media_urls;
    }

    if (post.image_url) {
      items.push({ url: post.image_url, type: 'image' as const });
    }
    const videoUrl = isLive ? liveVideoUrl : post.video_url;
    if (videoUrl) {
      items.push({ url: videoUrl, type: 'video' as const, poster, isLiveReplay: isLive, aspectRatio: isLive ? liveReplayAspectRatio : undefined });
    }
    return items;
  }, [post.id, post.post_type, post.media_urls, post.image_url, post.video_url, metadata, isLive, isActiveLive, isReconnectingLive, isEndedLive, isR2ReplayReady, isTempReplayReady, colReplayStatus, colReplayReady, colPlaybackProvider, liveStatus, rawLiveSessionId, resolvedLiveSessionId, resolvedArchiveUrl, playback, isFailedReplay]);

  const effectiveLiveSessionId = (metadata?.live_session_id as string | undefined) || rawLiveSessionId || resolvedLiveSessionId;

  if (isLive && isActiveLive) {
    return (
      <LivePostEmbed
        metadata={{ ...(metadata || {}), live_session_id: effectiveLiveSessionId, live_status: liveStatus || 'live' }}
        hostName={post.profiles?.display_name || post.profiles?.username || ''}
        postId={post.id}
        resolvedLiveSessionId={effectiveLiveSessionId}
      />
    );
  }

  const hasChunkedFallbackMedia = mediaItems.some((item) => isChunkedManifestUrl(item.url));
  const showOptimizingOverlay = (isTempReplayReady || hasChunkedFallbackMedia) && !isR2ReplayReady && mediaItems.length > 0;
  const archiveEtaSeconds = typeof metadata?.archive_eta_seconds === 'number' && metadata.archive_eta_seconds > 0
    ? Math.round(metadata.archive_eta_seconds)
    : null;
  const etaText = archiveEtaSeconds
    ? (archiveEtaSeconds < 60 ? `${t('pmedEtaPrefix')}${archiveEtaSeconds}${t('pmedEtaSecondsSuffix')}` : `${t('pmedEtaPrefix')}${Math.round(archiveEtaSeconds / 60)}${t('pmedEtaMinutesSuffix')}`)
    : '';
  const archivePhase = typeof metadata?.archive_phase === 'string' ? metadata.archive_phase : '';
  const isFinalizingPhase = ['verifying', 'posting', 'deleting_stream'].includes(archivePhase);
  const optimizingText = colProcessingMsg
    || (metadata?.processing_message as string | undefined)
    || (archiveProgressPercent && archiveProgressPercent >= 99 && isFinalizingPhase
      ? t('pmedFinalizingToR2')
      : (archiveProgressPercent && archiveProgressPercent > 0
        ? `${t('pmedSavingToR2Prefix')}${archiveProgressPercent}%${etaText}${t('pmedSavingToR2Suffix')}`
        : null))
    || t('pmedOptimizingReplay');

  return (
    <div className="relative" onClick={onDoubleTap}>
      {isMislinkedRepairPending ? (
        <div className="flex items-center justify-center p-6 bg-muted/50 text-muted-foreground text-sm gap-2">
          <Radio className="w-4 h-4 animate-pulse" />
          <span>{t('pmedCheckingReplay')}</span>
        </div>
      ) : isLive && post.post_type === 'live' && isReconnectingLive ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-black text-sm text-white/75">
          <Radio className="w-5 h-5 animate-pulse text-amber-400" />
          <span>{t('pmedReconnectingLive')}</span>
        </div>
      ) : isLive && post.post_type === 'live' && !isEndedLive ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-black text-sm text-white/75">
          <Radio className="w-5 h-5 animate-pulse text-red-500" />
          <span>{t('pmedConnectingLive')}</span>
        </div>
      ) : isLive && playback.status === 'ready' && playback.url ? (
        <ReplayPostMedia post={{ ...post, metadata }} playback={playback} />
      ) : mediaItems.length > 0 ? (
        <MediaGrid media={mediaItems} feedId={post.id} />
      ) : isEndedLive || isLive ? (
        isDefinitelyNoRecording ? (
          <div className="flex items-center justify-center p-6 bg-muted/50 text-muted-foreground text-sm gap-2">
            <Radio className="w-4 h-4" />
            <span>{t('pmedNoRecording')}</span>
          </div>
        ) : (() => {
          const archivePhaseStr = typeof metadata?.archive_phase === 'string' ? metadata.archive_phase : '';
          const phaseLabel = archivePhaseStr === 'mp4_export' || archivePhaseStr === 'mp4_wait'
            ? t('pmedPhaseEncoding')
            : archivePhaseStr === 'multipart_init' || archivePhaseStr === 'multipart_upload'
              ? t('pmedPhaseSavingR2')
              : archivePhaseStr === 'verifying' || archivePhaseStr === 'posting' || archivePhaseStr === 'deleting_stream'
                ? t('pmedPhaseFinalizing')
                : null;
          const errStr = typeof metadata?.archive_error === 'string' ? metadata.archive_error : '';
          const isRateLimited = errStr.startsWith('rate_limited_429');
          return (
            <div className="flex aspect-video flex-col items-center justify-center p-6 bg-muted/50 text-muted-foreground text-sm gap-2">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 animate-pulse" />
                <span className="whitespace-pre-line text-center">{replayStatusText}</span>
              </div>
              {phaseLabel && (
                <span className="text-xs text-muted-foreground/80">
                  {phaseLabel}{archiveProgressPercent ? ` • ${archiveProgressPercent}%` : ''}{etaText}
                </span>
              )}
              {typeof archiveProgressPercent === 'number' && archiveProgressPercent > 0 && (
                <div className="w-48 h-1 rounded-full bg-primary/20 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(99, archiveProgressPercent)}%` }}
                  />
                </div>
              )}
              {isRateLimited && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  {t('pmedRateLimitedNote')}
                </span>
              )}
            </div>
          );
        })()
      ) : null}
      {showOptimizingOverlay && (
        <div
          className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
          aria-live="polite"
        >
          <Radio className="h-3 w-3 animate-pulse" />
          <span>{optimizingText}</span>
        </div>
      )}
      <HeartAnimation show={showHeartAnimation} onComplete={onHeartComplete} />
    </div>
  );
});
