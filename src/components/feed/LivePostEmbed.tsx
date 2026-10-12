import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Eye, Radio, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { LiveVideoPreview } from './LiveVideoPreview';
import { LiveViewerControls } from './LiveViewerControls';
import { LiveFeedHlsBackground } from './LiveFeedHlsBackground';
import { cn } from '@/lib/utils';
import { useLiveDurationLimit } from '@/modules/live/hooks/useLiveDurationLimit';
import { toggleLiveLandscapeFullscreen, unlockLiveOrientation } from '@/modules/live/utils/liveFullscreen';
import { debugLivePost } from './livePostDebug';

interface LivePostEmbedProps {
  metadata: {
    live_session_id?: string | null;
    live_status?: string | null;
    channel_name?: string | null;
    viewer_count?: number;
    thumbnail_url?: string | null;
    live_title?: string | null;
    live_mode?: 'agora_webcam' | 'rtmp_obs' | null;
    started_at?: string | null;
    hls_url?: string | null;
    playback_url?: string | null;
    r2_video_url?: string | null;
    replay_status?: string | null;
    replay_ready?: boolean | null;
    [key: string]: unknown;
  };
  hostName: string;
  postId?: string;
  resolvedLiveSessionId?: string | null;
}

export const LivePostEmbed = ({ metadata, hostName, postId, resolvedLiveSessionId }: LivePostEmbedProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const frameRef = useRef<HTMLDivElement>(null);
  const sessionId = resolvedLiveSessionId || metadata.live_session_id || null;
  const viewerCount = metadata.viewer_count ?? 0;
  const thumbnailUrl = metadata.thumbnail_url;
  const isRtmp = metadata.live_mode === 'rtmp_obs';
  const durationLimit = useLiveDurationLimit(metadata.started_at, metadata.live_mode || 'agora_webcam', metadata.live_status === 'live' && !!metadata.started_at);
  const hlsUrl = metadata.hls_url || metadata.playback_url || null;
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [paused, setPaused] = useState(false);
  const [floating, setFloating] = useState(false);
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState<'unknown' | 'landscape' | 'portrait' | 'square'>('unknown');

  useEffect(() => {
    try {
      const storedMuted = localStorage.getItem('funprofile_live_muted');
      const storedVolume = localStorage.getItem('funprofile_live_volume');
      if (storedMuted !== null) setMuted(storedMuted === 'true');
      if (storedVolume !== null) {
        const nextVolume = Number(storedVolume);
        if (Number.isFinite(nextVolume)) setVolume(Math.max(0, Math.min(1, nextVolume)));
      }
    } catch {
      // Keep safe autoplay defaults if storage is blocked.
    }
  }, []);

  const persistPreference = useCallback((nextMuted: boolean, nextVolume: number) => {
    try {
      localStorage.setItem('funprofile_live_muted', String(nextMuted));
      localStorage.setItem('funprofile_live_volume', String(Math.max(0, Math.min(1, nextVolume))));
    } catch {
      // Storage may be disabled in private/browser-restricted contexts.
    }
  }, []);

  const handleWatchLive = useCallback(() => {
    if (sessionId) {
      navigate(`/live/${sessionId}`);
      return;
    }
    if (postId) {
      toast.info(t('lpeNotReadyOpening'));
      navigate(`/post/${postId}`);
      return;
    }
    toast.info(t('lpeNotReady'));
  }, [navigate, postId, sessionId]);

  useEffect(() => {
    const handleMiniOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string | null }>).detail;
      if (detail?.sessionId !== sessionId) setFloating(false);
    };
    window.addEventListener('funprofile:live-mini-open', handleMiniOpen);
    return () => window.removeEventListener('funprofile:live-mini-open', handleMiniOpen);
  }, [sessionId]);

  const onVideoReady = useCallback((ready: boolean) => {
    setIsVideoReady(ready);
  }, []);

  const handleVideoDimensions = useCallback(({ width, height }: { width: number; height: number }) => {
    if (!width || !height) return;
    const ratio = width / height;
    if (ratio > 1.12) setVideoOrientation('landscape');
    else if (ratio < 0.88) setVideoOrientation('portrait');
    else setVideoOrientation('square');
  }, []);

  const handlePlaybackBlocked = useCallback(() => {
    setNeedsUserGesture(true);
  }, []);

  const changeMuted = useCallback((nextMuted: boolean) => {
    const nextVolume = volume > 0 ? volume : 0.6;
    setMuted(nextMuted);
    if (!nextMuted && volume <= 0) setVolume(nextVolume);
    persistPreference(nextMuted, nextVolume);
    if (!nextMuted) setNeedsUserGesture(false);
  }, [persistPreference, volume]);

  const toggleMuted = useCallback(() => {
    changeMuted(!(muted || volume <= 0));
  }, [changeMuted, muted, volume]);

  const changeVolume = useCallback((nextVolume: number) => {
    const normalizedVolume = Math.max(0, Math.min(1, nextVolume));
    const nextMuted = normalizedVolume === 0;
    setVolume(normalizedVolume);
    setMuted(nextMuted);
    persistPreference(nextMuted, normalizedVolume);
    if (normalizedVolume > 0) setNeedsUserGesture(false);
  }, [persistPreference]);

  const handleTogglePlay = useCallback(() => {
    setPaused((value) => !value);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) unlockLiveOrientation();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      unlockLiveOrientation();
    };
  }, []);

  const handleFullscreen = useCallback(() => {
    toggleLiveLandscapeFullscreen(frameRef.current).catch(() => undefined);
  }, []);

  const handleFloat = useCallback(() => {
    if (!sessionId) return;
    window.dispatchEvent(new CustomEvent('funprofile:live-mini-open', { detail: { sessionId } }));
    setFloating(true);
  }, [sessionId]);

  const isPortraitVideo = videoOrientation === 'portrait';
  const mediaFrameClass = isPortraitVideo
    ? 'h-[72vh] min-h-[420px] max-h-[760px] sm:h-[76vh] sm:min-h-[520px]'
    : videoOrientation === 'square'
      ? 'aspect-square max-h-[720px]'
      : 'aspect-video';
  const videoFitMode = isPortraitVideo || videoOrientation === 'square' ? 'contain' : 'cover';

  useEffect(() => {
    debugLivePost('LivePostEmbed render', {
      postId,
      post_type: 'live',
      live_session_id: sessionId,
      playback_url: metadata.playback_url,
      hls_url: metadata.hls_url,
      stream_url: hlsUrl,
      r2_video_url: metadata.r2_video_url,
      replay_status: metadata.replay_status,
      replay_ready: metadata.replay_ready,
      live_status: metadata.live_status,
      live_mode: metadata.live_mode,
      has_thumbnail: !!thumbnailUrl,
      has_video_ready: isVideoReady,
      render_decision: sessionId ? (isRtmp ? 'rtmp_hls_embed' : 'agora_preview_embed') : 'live_placeholder_no_session',
    });
  }, [hlsUrl, isRtmp, isVideoReady, metadata, postId, sessionId, thumbnailUrl]);

  return (
    <>
      <div
        ref={frameRef}
        className={cn(
          'group relative w-full cursor-pointer overflow-hidden bg-black',
          '[&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:bg-black [&:fullscreen_video]:!object-contain',
          mediaFrameClass,
          !isPortraitVideo && 'bg-gradient-to-br from-gray-900 via-gray-800 to-black',
        )}
        onClick={handleWatchLive}
      >
      {sessionId && isRtmp && hlsUrl && (
        <LiveFeedHlsBackground
          src={hlsUrl}
          muted={muted || volume <= 0}
          volume={volume}
          paused={paused || floating}
          fitMode={videoFitMode}
          onVideoReady={onVideoReady}
          onPlaybackBlocked={handlePlaybackBlocked}
          onMutedChange={changeMuted}
          onVideoDimensions={handleVideoDimensions}
        />
      )}

      {sessionId && !isRtmp && (
        <LiveVideoPreview
          sessionId={sessionId}
          muted={muted || volume <= 0}
          volume={volume}
          paused={paused || floating}
          onVideoReady={onVideoReady}
        />
      )}

      {!isVideoReady && (
        <>
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Live thumbnail"
              className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-50"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Video className="h-16 w-16 text-white/30" />
            </div>
          )}
        </>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

      {floating && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/45">
          <span className="rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
            Dang phat o cua so noi
          </span>
        </div>
      )}

      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <span className="flex animate-pulse items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
          <Radio className="h-3.5 w-3.5" />
          LIVE
        </span>
        {viewerCount > 0 && (
          <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs text-white backdrop-blur-sm">
            <Eye className="h-3.5 w-3.5" />
            {viewerCount}
          </span>
        )}
      </div>

      {isVideoReady && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="rounded-full bg-black/50 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
            {t('lpeTapToWatch')}
          </span>
        </div>
      )}

      {!isVideoReady && !sessionId && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600/90 shadow-lg shadow-red-600/30 transition-transform group-hover:scale-110">
            <Radio className="h-8 w-8 text-white" />
          </div>
          <span className="rounded-full bg-black/40 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
            {t('lpeWatchLive')}
          </span>
        </div>
      )}

      <div className="absolute bottom-3 left-3 right-3 z-10">
        <p className="max-w-[60%] truncate text-xs text-white/80 sm:max-w-[70%]">
          {hostName} {t('pohLiveNowShort')}
        </p>
        {metadata.started_at && (
          <p className={cn(
            'mt-1 max-w-[85%] truncate text-xs font-semibold text-white/75',
            durationLimit.warningLevel === 'urgent' && 'text-red-200',
            durationLimit.warningLevel === 'warning' && 'text-amber-200',
          )}>
            {durationLimit.combinedLabel}
          </p>
        )}
        {durationLimit.warningLevel === 'urgent' && (
          <p className="mt-1 max-w-[90%] rounded-md bg-red-600/85 px-2 py-1 text-[11px] font-bold text-white">
            {t('lpeAutoEndBefore')}{Math.ceil((durationLimit.remainingSeconds || 0) / 60)}{t('lpeAutoEndAfter')}
          </p>
        )}
      </div>

        <LiveViewerControls
          muted={muted}
          volume={volume}
          paused={paused}
          onToggleMuted={toggleMuted}
          onVolumeChange={changeVolume}
          onTogglePlay={handleTogglePlay}
          onFullscreen={handleFullscreen}
          onFloat={sessionId ? handleFloat : undefined}
          needsUserGesture={needsUserGesture}
        />
      </div>

      {floating && sessionId && (
        <div
          className="fixed bottom-24 right-3 z-[80] w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl md:bottom-5 md:right-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="relative aspect-video bg-black">
            {isRtmp && hlsUrl ? (
              <LiveFeedHlsBackground
                src={hlsUrl}
                muted={muted || volume <= 0}
                volume={volume}
                paused={paused}
                fitMode="contain"
                onPlaybackBlocked={handlePlaybackBlocked}
                onMutedChange={changeMuted}
              />
            ) : (
              <LiveVideoPreview
                sessionId={sessionId}
                muted={muted || volume <= 0}
                volume={volume}
                paused={paused}
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
            <button
              type="button"
              className="absolute right-2 top-2 z-40 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
              onClick={() => setFloating(false)}
              aria-label="Dong cua so noi"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="absolute left-3 top-3 z-30 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white"
              onClick={handleWatchLive}
            >
              Xem live
            </button>
            <LiveViewerControls
              muted={muted}
              volume={volume}
              paused={paused}
              onToggleMuted={toggleMuted}
              onVolumeChange={changeVolume}
              onTogglePlay={handleTogglePlay}
              compact
            />
          </div>
        </div>
      )}
    </>
  );
};
