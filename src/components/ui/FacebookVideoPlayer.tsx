import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Loader2, Settings, PictureInPicture2 } from 'lucide-react';
import Hls from 'hls.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VideoSource {
  src: string;
  type?: string;
  label?: string;
}

export interface FacebookVideoPlayerProps {
  src?: string;
  sources?: VideoSource[];
  poster?: string;
  width?: number | string;
  height?: number | string;
  autoPlayInView?: boolean;
  mutedByDefault?: boolean;
  className?: string;
  compact?: boolean;
  objectFit?: 'contain' | 'cover';
  onPlay?: () => void;
  onPlayStart?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (code?: number) => void;
  onVideoMetadata?: (meta: { width: number; height: number }) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmt(s: number): string {
  if (!isFinite(s) || isNaN(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${m}:${sec.toString().padStart(2, '0')}`;
}

function isHls(url: string) {
  return /\.m3u8(\?|$)/i.test(url);
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const FacebookVideoPlayer = memo(({
  src,
  sources,
  poster,
  autoPlayInView = true,
  mutedByDefault = true,
  className,
  compact = false,
  objectFit: objectFitProp,
  onPlay,
  onPlayStart,
  onPause,
  onEnded,
  onError,
  onVideoMetadata,
}: FacebookVideoPlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const hlsRetryRef = useRef(0);

  // State
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(mutedByDefault);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>(objectFitProp || 'contain');

  // Sync fitMode when objectFitProp changes
  useEffect(() => {
    if (objectFitProp) setFitMode(objectFitProp);
  }, [objectFitProp]);
  const [pip, setPip] = useState(false);
  const [hasError, setHasError] = useState(false);

  const resolvedSrc = src || sources?.[0]?.src || '';

  // Keep latest callbacks in a ref so the src/listener effects below depend
  // ONLY on `resolvedSrc`. Otherwise every parent re-render hands us new
  // callback identities, the effects re-run, we re-assign `v.src`, and the
  // browser fires spurious `abort`/`error` events on the previous load —
  // which used to bubble up and permanently blacklist the video in the feed.
  const callbacksRef = useRef({ onPlay, onPlayStart, onPause, onEnded, onError, onVideoMetadata });
  useEffect(() => {
    callbacksRef.current = { onPlay, onPlayStart, onPause, onEnded, onError, onVideoMetadata };
  }, [onPlay, onPlayStart, onPause, onEnded, onError, onVideoMetadata]);

  /* ---- HLS / source setup ---- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !resolvedSrc) return;

    let hls: Hls | null = null;
    hlsRetryRef.current = 0;
    setHasError(false);
    setLoading(true);

    if (isHls(resolvedSrc)) {
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        hls.loadSource(resolvedSrc);
        hls.attachMedia(v);
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            if (hls && hlsRetryRef.current < 2) {
              hlsRetryRef.current += 1;
              window.setTimeout(() => {
                try {
                  hls?.stopLoad();
                  hls?.loadSource(resolvedSrc);
                  hls?.startLoad();
                } catch {
                  setHasError(true);
                  callbacksRef.current.onError?.();
                }
              }, 750 * hlsRetryRef.current);
              return;
            }
            setHasError(true);
            callbacksRef.current.onError?.();
          }
        });
        hlsRef.current = hls;
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = resolvedSrc;
      }
    } else {
      v.src = resolvedSrc;
    }

    return () => {
      if (hls) { hls.destroy(); hlsRef.current = null; }
    };
  }, [resolvedSrc]);

  /* ---- Video event listeners ---- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const cbs = () => callbacksRef.current;
    const onPlaying = () => { setPlaying(true); setLoading(false); cbs().onPlay?.(); cbs().onPlayStart?.(); };
    const onPauseEvt = () => { setPlaying(false); cbs().onPause?.(); };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onEndedEvt = () => { setPlaying(false); cbs().onEnded?.(); };
    const updateTime = () => {
      setCurrent(v.currentTime);
      if (v.duration && isFinite(v.duration)) setDuration(v.duration);
    };
    const updateBuffered = () => {
      if (v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1));
      }
    };
    const onLoadedMeta = () => {
      if (v.duration && isFinite(v.duration)) setDuration(v.duration);
      updateBuffered();
      setLoading(false);
      if (v.videoWidth && v.videoHeight) {
        cbs().onVideoMetadata?.({ width: v.videoWidth, height: v.videoHeight });
      }
    };
    // Distinguish error codes:
    //  1 = MEDIA_ERR_ABORTED       → ignore (src reassignment / unmount during load)
    //  2 = MEDIA_ERR_NETWORK       → bubble code so MediaGrid can rate-limit before blacklisting
    //  3 = MEDIA_ERR_DECODE        → bubble (fatal)
    //  4 = MEDIA_ERR_SRC_NOT_SUPPORTED → bubble (fatal)
    const onErr = () => {
      const code = v.error?.code;
      if (code === 1) return; // aborted: not a real failure
      if (code === 3 || code === 4) setHasError(true);
      cbs().onError?.(code);
    };

    // Immediately check if metadata already loaded (handles stale closure timing)
    if (v.videoWidth && v.videoHeight) {
      cbs().onVideoMetadata?.({ width: v.videoWidth, height: v.videoHeight });
    }

    v.addEventListener('playing', onPlaying);
    v.addEventListener('pause', onPauseEvt);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('ended', onEndedEvt);
    v.addEventListener('timeupdate', updateTime);
    v.addEventListener('progress', updateBuffered);
    v.addEventListener('loadedmetadata', onLoadedMeta);
    v.addEventListener('error', onErr);

    return () => {
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('pause', onPauseEvt);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('ended', onEndedEvt);
      v.removeEventListener('timeupdate', updateTime);
      v.removeEventListener('progress', updateBuffered);
      v.removeEventListener('loadedmetadata', onLoadedMeta);
      v.removeEventListener('error', onErr);
    };
  }, [resolvedSrc]);

  /* ---- IntersectionObserver autoplay ---- */
  useEffect(() => {
    if (!autoPlayInView) return;
    const el = containerRef.current;
    const v = videoRef.current;
    if (!el || !v) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !userPaused) {
          v.play().catch(() => {});
        } else if (!entry.isIntersecting) {
          v.pause();
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [autoPlayInView, userPaused, resolvedSrc]);

  /* ---- Auto-hide controls ---- */
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2500);
  }, [playing]);

  useEffect(() => {
    if (!playing) { setShowControls(true); return; }
    resetHideTimer();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [playing, resetHideTimer]);

  /* ---- Actions ---- */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setUserPaused(false);
    } else {
      v.pause();
      setUserPaused(true);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !v.muted;
    if (!nextMuted && v.volume === 0) {
      const nextVolume = volume > 0 ? volume : 1;
      v.volume = nextVolume;
      setVolume(nextVolume);
    }
    v.muted = nextMuted;
    setMuted(v.muted);
  }, [volume]);

  const handleVolumeChange = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    setVolume(val);
    if (val > 0 && v.muted) { v.muted = false; setMuted(false); }
    if (val === 0) { v.muted = true; setMuted(true); }
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
  }, [duration]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  }, []);

  const changeSpeed = useCallback((s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = s;
    setSpeed(s);
    setShowSettings(false);
  }, []);

  const toggleFit = useCallback(() => {
    setFitMode(prev => prev === 'contain' ? 'cover' : 'contain');
    setShowSettings(false);
  }, []);

  const togglePip = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (e) {
      console.error('PiP failed', e);
    }
  }, []);

  /* ---- Keyboard ---- */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const v = videoRef.current;
    if (!v) return;
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': v.currentTime = Math.max(0, v.currentTime - 5); break;
      case 'ArrowRight': v.currentTime = Math.min(duration, v.currentTime + 5); break;
      case 'm': case 'M': toggleMute(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'p': case 'P': togglePip(); break;
    }
  }, [togglePlay, toggleMute, toggleFullscreen, togglePip, duration]);

  /* ---- Mobile tap ---- */
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Only handle taps on the video area itself (not controls)
    if ((e.target as HTMLElement).closest('[data-controls]')) return;
    if ('ontouchstart' in window) {
      setShowControls(prev => !prev);
    } else {
      togglePlay();
    }
    resetHideTimer();
  }, [togglePlay, resetHideTimer]);

  /* ---- Fullscreen change listener ---- */
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  /* ---- PiP change listener ---- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnterPip = () => setPip(true);
    const onLeavePip = () => setPip(false);
    v.addEventListener('enterpictureinpicture', onEnterPip);
    v.addEventListener('leavepictureinpicture', onLeavePip);
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnterPip);
      v.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, [resolvedSrc]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setLoading(true);
    const v = videoRef.current;
    if (v) {
      try { v.load(); v.play().catch(() => {}); } catch { /* ignore */ }
    }
  }, []);

  if (hasError) {
    return (
      <div className={cn('relative flex items-center justify-center bg-black text-white/80 aspect-video overflow-hidden', className)}>
        {poster && (
          <img
            src={poster}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative flex flex-col items-center gap-3 p-6 text-center">
          <svg className="w-10 h-10 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-sm">Không thể phát video replay</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleRetry(); }}
            className="px-4 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={cn('relative bg-black group', className)}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (playing) setShowControls(false); }}
      onClick={handleContainerClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="application"
      aria-label="Video player"
    >
      {/* Video element */}
      <video
        ref={videoRef}
        poster={poster}
        muted={muted}
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        className={cn(
          'w-full h-full',
          fitMode === 'contain' ? 'object-contain' : 'object-cover'
        )}
      />

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <Loader2 className="w-10 h-10 text-white/80 animate-spin" />
        </div>
      )}

      {/* Controls overlay */}
      <div
        data-controls
        className={cn(
          'absolute inset-0 flex flex-col justify-between transition-opacity duration-300 z-20',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        {/* Top gradient */}
        <div className="h-12 bg-gradient-to-b from-black/50 to-transparent" />

        {/* Center play button */}
        {!compact && !playing && (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="w-16 h-16 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors backdrop-blur-sm"
              aria-label="Play"
            >
              <Play className="w-8 h-8 ml-1" />
            </button>
          </div>
        )}
        {!compact && playing && <div className="flex-1" />}

        {/* Bottom controls */}
        <div className="bg-gradient-to-t from-black/70 to-transparent pt-8 pb-2 px-3" data-controls>
          {/* Seek bar */}
          {!compact && (
            <div
              className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-2 relative group/seek"
              onClick={(e) => { e.stopPropagation(); handleSeek(e); }}
              data-controls
            >
              {/* Buffered */}
              <div
                className="absolute top-0 left-0 h-full bg-white/30 rounded-full"
                style={{ width: `${bufferPct}%` }}
              />
              {/* Progress */}
              <div
                className="absolute top-0 left-0 h-full bg-primary rounded-full transition-[width] duration-100"
                style={{ width: `${progress}%` }}
              />
              {/* Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-primary rounded-full opacity-0 group-hover/seek:opacity-100 transition-opacity shadow-lg"
                style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
              />
            </div>
          )}

          {/* Button row */}
          <div className="flex items-center gap-2" data-controls>
            {/* Play/Pause */}
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
              aria-label={playing ? 'Pause' : 'Play'}
              data-controls
            >
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            {/* Time (non-compact) */}
            {!compact && (
              <span className="text-white text-xs tabular-nums select-none" data-controls>
                {fmt(currentTime)} / {fmt(duration)}
              </span>
            )}

            <div className="flex-1" />

            {/* Volume (desktop, non-compact) */}
            {!compact && (
              <div className="hidden sm:flex items-center gap-1 group/vol" data-controls>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                  className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
                  aria-label={muted ? 'Bat am thanh' : 'Tat am thanh'}
                  data-controls
                >
                  {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => { e.stopPropagation(); handleVolumeChange(parseFloat(e.target.value)); }}
                  className="w-0 group-hover/vol:w-20 transition-all duration-200 accent-primary h-1 cursor-pointer"
                  data-controls
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {/* Mute button (mobile, non-compact) */}
            {!compact && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                className="sm:hidden w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
                aria-label={muted ? 'Bat am thanh' : 'Tat am thanh'}
                data-controls
              >
                {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}

            {/* Mute button (compact) */}
            {compact && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
                aria-label={muted ? 'Bat am thanh' : 'Tat am thanh'}
                data-controls
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}

            {/* PiP button (compact) */}
            {compact && (
              <button
                onClick={(e) => { e.stopPropagation(); togglePip(); }}
                className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
                aria-label={pip ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                data-controls
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>
            )}

            {/* Settings (non-compact) */}
            {!compact && (
              <div className="relative" data-controls>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSettings(prev => !prev); }}
                  className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
                  aria-label="Settings"
                  data-controls
                >
                  <Settings className="w-4.5 h-4.5" />
                </button>
                {showSettings && (
                  <div
                    className="absolute bottom-10 right-0 bg-black/90 backdrop-blur-md rounded-lg p-2 min-w-[140px] shadow-xl border border-white/10"
                    onClick={(e) => e.stopPropagation()}
                    data-controls
                  >
                    <p className="text-[10px] text-white/50 uppercase tracking-wider px-2 mb-1">Tốc độ</p>
                    <div className="flex flex-wrap gap-1 px-1 mb-2">
                      {SPEEDS.map(s => (
                        <button
                          key={s}
                          onClick={() => changeSpeed(s)}
                          className={cn(
                            'text-xs px-2 py-1 rounded transition-colors',
                            speed === s ? 'bg-primary text-primary-foreground' : 'text-white/70 hover:bg-white/10'
                          )}
                          data-controls
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={toggleFit}
                      className="w-full text-left text-xs text-white/70 hover:bg-white/10 px-2 py-1.5 rounded transition-colors"
                      data-controls
                    >
                      {fitMode === 'contain' ? '⬜ Vừa khung' : '🔲 Lấp đầy'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* PiP (non-compact) */}
            {!compact && (
              <button
                onClick={(e) => { e.stopPropagation(); togglePip(); }}
                className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
                aria-label={pip ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                data-controls
              >
                <PictureInPicture2 className="w-4.5 h-4.5" />
              </button>
            )}

            {/* Fullscreen */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              data-controls
            >
              {fullscreen ? <Minimize className="w-4.5 h-4.5" /> : <Maximize className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

FacebookVideoPlayer.displayName = 'FacebookVideoPlayer';
