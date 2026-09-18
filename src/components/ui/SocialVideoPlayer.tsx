/**
 * SocialVideoPlayer — Custom video controls overlay (Facebook/YouTube style)
 * Wraps a <video> element via ref and renders play/pause, seek, volume,
 * speed, fullscreen, PiP, time display, buffered bar, mobile double-tap.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
  type ReactNode,
  memo,
} from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  PictureInPicture2,
  Loader2,
} from 'lucide-react';
import { formatDurationTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface SocialVideoPlayerProps {
  videoRef: RefObject<HTMLVideoElement>;
  /** Show controls overlay (default true) */
  showControls?: boolean;
  /** Auto-hide delay in ms (default 3000) */
  autoHideMs?: number;
  /** Extra class on wrapper */
  className?: string;
  /** The <video> element itself */
  children?: ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Speed options                                                      */
/* ------------------------------------------------------------------ */

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const SocialVideoPlayer = memo(({
  videoRef,
  showControls = true,
  autoHideMs = 3000,
  className,
  children,
}: SocialVideoPlayerProps) => {
  /* ---- state ---- */
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(true);
  const [isEnded, setIsEnded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [doubleTapAnim, setDoubleTapAnim] = useState<{ side: 'left' | 'right'; key: number } | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const animKeyRef = useRef(0);

  const isLive = duration === Infinity;
  const validDuration = duration > 0 && isFinite(duration);
  const progressPct = validDuration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = validDuration ? (buffered / duration) * 100 : 0;

  /* ---- auto-hide controls ---- */
  const scheduleHide = useCallback(() => {
    // Never auto-hide controls when video is paused
    if (!isPlaying) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying && !isSeeking) setShowOverlay(false);
    }, autoHideMs);
  }, [autoHideMs, isPlaying, isSeeking]);

  const revealControls = useCallback(() => {
    setShowOverlay(true);
    scheduleHide();
  }, [scheduleHide]);

  /* ---- video event listeners ---- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onLoadedMetadata = () => {
      if (v.duration) setDuration(v.duration);
      setIsVideoLoaded(true);
    };
    const onTimeUpdate = () => {
      if (!isSeeking) setCurrentTime(v.currentTime);
    };
    const onProgress = () => {
      if (v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1));
      }
    };
    const onPlay = () => { setIsPlaying(true); setIsEnded(false); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsEnded(true); setIsPlaying(false); setShowOverlay(true); };
    const onVolumeChange = () => {
      setVolume(v.volume);
      setIsMuted(v.muted);
    };
    const onDurationChange = () => {
      if (v.duration && isFinite(v.duration)) setDuration(v.duration);
    };
    const onCanPlay = () => setIsVideoLoaded(true);

    v.addEventListener('loadedmetadata', onLoadedMetadata);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('progress', onProgress);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    v.addEventListener('volumechange', onVolumeChange);
    v.addEventListener('durationchange', onDurationChange);
    v.addEventListener('canplay', onCanPlay);

    // Sync initial state
    if (v.duration && isFinite(v.duration)) setDuration(v.duration);
    setIsMuted(v.muted);
    setVolume(v.volume);

    return () => {
      v.removeEventListener('loadedmetadata', onLoadedMetadata);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('progress', onProgress);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('volumechange', onVolumeChange);
      v.removeEventListener('durationchange', onDurationChange);
      v.removeEventListener('canplay', onCanPlay);
    };
  }, [videoRef, isSeeking]);

  /* ---- duration polling fallback (for MSE where durationchange fires late) ---- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || validDuration || isLive) return;
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      if (v.duration && v.duration > 0) {
        setDuration(v.duration);
        clearInterval(id);
      }
      if (attempts >= 5) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [videoRef, validDuration, isLive]);

  /* ---- cleanup hide timer ---- */
  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  /* ---- schedule hide when playing starts, show when paused ---- */
  useEffect(() => {
    if (isPlaying) {
      scheduleHide();
    } else {
      // Always show controls when paused
      setShowOverlay(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }
  }, [isPlaying, scheduleHide]);

  /* ---- actions ---- */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isEnded) {
      v.currentTime = 0;
      setIsEnded(false);
    }
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, [videoRef, isEnded]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, [videoRef]);

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, val));
    if (val > 0 && v.muted) v.muted = false;
  }, [videoRef]);

  const changeSpeed = useCallback((rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  const togglePiP = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch { /* PiP not supported on all browsers — safe to ignore */ }
  }, [videoRef]);

  /* ---- fullscreen state sync ---- */
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* ---- seek via progress bar ---- */
  const seekTo = useCallback((e: React.MouseEvent | MouseEvent) => {
    const bar = progressRef.current;
    const v = videoRef.current;
    if (!bar || !v || !validDuration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  }, [videoRef, validDuration, duration]);

  const onProgressMouseDown = useCallback((e: React.MouseEvent) => {
    setIsSeeking(true);
    seekTo(e);
    const onMove = (me: MouseEvent) => seekTo(me);
    const onUp = () => {
      setIsSeeking(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [seekTo]);

  /* ---- touch seek for progress bar ---- */
  const onProgressTouchStart = useCallback((e: React.TouchEvent) => {
    setIsSeeking(true);
    const bar = progressRef.current;
    const v = videoRef.current;
    if (!bar || !v || !validDuration) return;
    const touch = e.touches[0];
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  }, [videoRef, validDuration, duration]);

  const onProgressTouchMove = useCallback((e: React.TouchEvent) => {
    const bar = progressRef.current;
    const v = videoRef.current;
    if (!bar || !v || !validDuration) return;
    const touch = e.touches[0];
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  }, [videoRef, validDuration, duration]);

  const onProgressTouchEnd = useCallback(() => {
    setIsSeeking(false);
  }, []);

  /* ---- double-tap to skip (mobile) ---- */
  const handleVideoAreaTap = useCallback((e: React.MouseEvent) => {
    // Ignore clicks on controls bar
    if ((e.target as HTMLElement).closest('[data-controls]')) return;

    const now = Date.now();
    const { time: lastTime, x: lastX } = lastTapRef.current;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const tapX = e.clientX - rect.left;
    const isLeftHalf = tapX < rect.width / 2;

    if (now - lastTime < 300 && Math.abs(tapX - lastX) < 100) {
      // Double tap
      const v = videoRef.current;
      if (v) {
        const skip = isLeftHalf ? -10 : 10;
        v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + skip));
        animKeyRef.current++;
        setDoubleTapAnim({ side: isLeftHalf ? 'left' : 'right', key: animKeyRef.current });
        setTimeout(() => setDoubleTapAnim(null), 600);
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      // Single tap → toggle controls
      lastTapRef.current = { time: now, x: tapX };
      if (showOverlay) {
        setShowOverlay(false);
      } else {
        revealControls();
      }
    }
  }, [videoRef, showOverlay, revealControls]);

  if (!showControls) {
    return (
      <div className={cn('relative', className)}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={cn('relative group select-none', className)}
      onMouseMove={revealControls}
      onClick={handleVideoAreaTap}
    >
      {/* Video element (children) */}
      {children}

      {/* Loading skeleton */}
      {!isVideoLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
          <Loader2 className="h-10 w-10 animate-spin text-white/80" />
        </div>
      )}

      {/* Double-tap animation */}
      {doubleTapAnim && (
        <div
          key={doubleTapAnim.key}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 z-30 pointer-events-none animate-fade-in text-white text-lg font-bold bg-black/40 rounded-full px-4 py-2',
            doubleTapAnim.side === 'left' ? 'left-8' : 'right-8'
          )}
        >
          {doubleTapAnim.side === 'left' ? '-10s' : '+10s'}
        </div>
      )}

      {/* Center play/pause / replay */}
      {showOverlay && (
        <button
          className="absolute inset-0 z-10 flex items-center justify-center"
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          data-controls
        >
          <div className={cn(
            'w-16 h-16 rounded-full bg-black/50 flex items-center justify-center transition-transform hover:scale-110',
            isPlaying && !isEnded && 'opacity-0 group-hover:opacity-100'
          )}>
            {isEnded ? (
              <RotateCcw className="w-7 h-7 text-white" />
            ) : isPlaying ? (
              <Pause className="w-7 h-7 text-white" />
            ) : (
              <Play className="w-7 h-7 text-white ml-1" />
            )}
          </div>
        </button>
      )}

      {/* Bottom controls bar */}
      <div
        data-controls
        className={cn(
          'absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-200',
          showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient backdrop */}
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-10 pb-2 px-3">
          {/* Progress bar */}
          <div
            ref={progressRef}
            className={cn(
              "relative w-full h-1.5 md:h-1 group/progress rounded-full mb-2 hover:h-2.5 transition-all",
              isLive ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            )}
            onMouseDown={isLive ? undefined : onProgressMouseDown}
            onTouchStart={isLive ? undefined : onProgressTouchStart}
            onTouchMove={isLive ? undefined : onProgressTouchMove}
            onTouchEnd={isLive ? undefined : onProgressTouchEnd}
            title={isLive ? 'Livestream không hỗ trợ tua' : undefined}
          >
            {/* Track */}
            <div className="absolute inset-0 bg-white/20 rounded-full" />
            {/* Buffered */}
            <div
              className="absolute inset-y-0 left-0 bg-white/40 rounded-full"
              style={{ width: `${bufferedPct}%` }}
            />
            {/* Progress */}
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full"
              style={{ width: `${progressPct}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-primary rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `calc(${progressPct}% - 7px)` }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2 text-white text-xs">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              {isEnded ? (
                <RotateCcw className="w-4 h-4" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>

            {/* Time */}
            <span className="tabular-nums whitespace-nowrap text-[11px]">
              {isLive ? (
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="font-bold text-red-400">LIVE</span>
                </span>
              ) : (
                <>{formatDurationTime(currentTime)} / {validDuration ? formatDurationTime(duration) : '--:--'}</>
              )}
            </span>

            <div className="flex-1" />

            {/* Volume (desktop) */}
            <div className="hidden md:flex items-center gap-1 group/vol">
              <button onClick={toggleMute} className="p-1 hover:bg-white/10 rounded transition-colors">
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => changeVolume(parseFloat(e.target.value))}
                className="w-0 group-hover/vol:w-16 transition-all duration-200 accent-primary h-1 cursor-pointer"
              />
            </div>

            {/* Mute toggle (mobile) */}
            <button onClick={toggleMute} className="md:hidden p-1 hover:bg-white/10 rounded transition-colors">
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            {/* Speed */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(v => !v)}
                className="p-1 hover:bg-white/10 rounded transition-colors text-[11px] font-semibold min-w-[32px]"
              >
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-1 bg-black/90 rounded-lg py-1 shadow-xl border border-white/10 min-w-[60px]">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => changeSpeed(s)}
                      className={cn(
                        'block w-full px-3 py-1.5 text-[11px] text-left hover:bg-white/10 transition-colors',
                        s === playbackRate && 'text-primary font-bold'
                      )}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* PiP */}
            {'pictureInPictureEnabled' in document && (
              <button onClick={togglePiP} className="p-1 hover:bg-white/10 rounded transition-colors">
                <PictureInPicture2 className="w-4 h-4" />
              </button>
            )}

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="p-1 hover:bg-white/10 rounded transition-colors">
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

SocialVideoPlayer.displayName = 'SocialVideoPlayer';
export default SocialVideoPlayer;
