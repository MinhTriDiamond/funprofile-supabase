# Live Feed Video Player Controls

Tài liệu này đóng gói tính năng **Live Feed Video Player Controls** cho FUN Profile để gửi Lovable. Mục tiêu là nâng cấp video LIVE trên feed/profile thành trải nghiệm giống Facebook Live: có play/pause, âm lượng, fullscreen, theater mode, quality selector khi HLS hỗ trợ, badge LIVE và viewer count.

## 1. Tên tính năng

**Live Feed Video Player Controls**

Tên đầy đủ:

**Facebook-style Live Feed Video Player**

Tên kỹ thuật:

**RTMP/OBS Live Feed Player with Theater Mode, Fullscreen, Volume, Play/Pause, and Quality Selector**

Tên tiếng Việt:

**Trình phát video LIVE trên feed kiểu Facebook Live**

## 2. Mục tiêu

Khi viewer xem video LIVE trên feed, player cần có:

- Play / Pause.
- Mute / Unmute.
- Volume slider.
- Fullscreen.
- Theater mode / floating live modal.
- Quality selector nếu HLS.js detect được levels.
- Badge LIVE.
- Viewer count.
- Autoplay muted để tránh browser chặn.
- Nút “Nhấn để xem trực tiếp” nếu autoplay bị block.

Replay R2 không bị ảnh hưởng. Tính năng này tập trung vào **RTMP/OBS live feed player**.

## 3. Audit hiện tại

Các file/path liên quan:

| File | Vai trò |
| --- | --- |
| `src/components/feed/FacebookPostCard.tsx` | Render feed card và realtime replay hydrate |
| `src/components/feed/PostMedia.tsx` | Phân biệt live/replay media |
| `src/components/feed/LivePostEmbed.tsx` | Live card trên feed/profile |
| `src/components/feed/RtmpHlsPreview.tsx` | RTMP HLS preview cũ, chỉ preview, không đủ controls |
| `src/components/feed/LiveVolumeControl.tsx` | Control âm lượng cũ |
| `src/components/feed/LiveVideoPreview.tsx` | Agora live preview |
| `src/components/ui/ReplayPlayer.tsx` | HLS/MP4 player dùng cho replay và preview |
| `src/components/feed/LiveFeedVideoPlayer.tsx` | Player mới cho RTMP/OBS live feed |

Flow cũ:

- RTMP live feed lấy `metadata.hls_url || metadata.playback_url`.
- `LivePostEmbed` render `RtmpHlsPreview`.
- `RtmpHlsPreview` dùng `ReplayPlayer` với `controls={false}`.
- UI chỉ có `LiveVolumeControl`.

Thiếu trước khi triển khai:

- Không có play/pause overlay.
- Không có fullscreen.
- Không có theater mode.
- Không có quality selector.
- Click toàn bộ card điều hướng sang trang live, dễ làm viewer bấm nhầm khi muốn điều khiển video.
- Chưa có UI “Nhấn để xem trực tiếp” khi autoplay bị browser chặn.

## 4. Thiết kế mới

RTMP/OBS live trên feed dùng component mới:

```tsx
<LiveFeedVideoPlayer
  src={hlsUrl}
  hostName={hostName}
  viewerCount={viewerCount}
  muted={muted || volume <= 0}
  volume={volume}
  onMutedChange={changeMuted}
  onVolumeChange={changeVolume}
  onVideoReady={onVideoReady}
  onPlaybackBlocked={() => setNeedsUserGesture(true)}
  onWatchLive={handleWatchLive}
/>
```

Player type:

- RTMP/OBS live: `HTMLVideoElement + HLS.js`.
- Safari/native HLS: native video HLS.
- Replay R2: vẫn dùng replay/R2 player hiện tại, không đổi.
- Agora live: vẫn dùng `LiveVideoPreview` + `LiveVolumeControl`.

## 5. Source code: LiveFeedVideoPlayer

File: `src/components/feed/LiveFeedVideoPlayer.tsx`

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Eye,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Radio,
  ScreenShare,
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QualityOption {
  label: string;
  level: number;
}

interface LiveFeedVideoPlayerProps {
  src: string;
  hostName: string;
  viewerCount?: number;
  muted: boolean;
  volume: number;
  onMutedChange: (muted: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onVideoReady?: (ready: boolean) => void;
  onPlaybackBlocked?: () => void;
  onWatchLive?: () => void;
  theaterChild?: boolean;
}

function qualityLabel(height?: number, bitrate?: number) {
  if (height) return `${height}p`;
  if (bitrate) return `${Math.round(bitrate / 1000)}kbps`;
  return 'Auto';
}

export function LiveFeedVideoPlayer({
  src,
  hostName,
  viewerCount = 0,
  muted,
  volume,
  onMutedChange,
  onVolumeChange,
  onVideoReady,
  onPlaybackBlocked,
  onWatchLive,
  theaterChild = false,
}: LiveFeedVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isVisible, setIsVisible] = useState(theaterChild);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [playBlocked, setPlayBlocked] = useState(false);
  const [theaterOpen, setTheaterOpen] = useState(false);

  const normalizedVolume = Math.max(0, Math.min(1, volume));
  const actuallyMuted = muted || normalizedVolume === 0;
  const canChooseQuality = qualityOptions.length > 1;

  const sortedQualityOptions = useMemo(() => (
    [...qualityOptions].sort((a, b) => {
      if (a.level === -1) return -1;
      if (b.level === -1) return 1;
      return Number.parseInt(b.label, 10) - Number.parseInt(a.label, 10);
    })
  ), [qualityOptions]);

  useEffect(() => {
    if (theaterChild) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.45 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [theaterChild]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = normalizedVolume;
    video.muted = actuallyMuted;
    if (!actuallyMuted && video.paused && !playBlocked) {
      video.play().catch(() => {
        setPlayBlocked(true);
        onPlaybackBlocked?.();
      });
    }
  }, [actuallyMuted, normalizedVolume, onPlaybackBlocked, playBlocked]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !isVisible) return;

    setReady(false);
    setBuffering(true);
    setPlayBlocked(false);
    setQualityOptions([]);
    setSelectedLevel(-1);
    onVideoReady?.(false);

    const handleReady = () => {
      setReady(true);
      setBuffering(false);
      onVideoReady?.(true);
      video.muted = actuallyMuted;
      video.volume = normalizedVolume;
      video.play().catch(() => {
        video.muted = true;
        onMutedChange(true);
        video.play().catch(() => {
          setPlayBlocked(true);
          onPlaybackBlocked?.();
        });
      });
    };

    const handlePlaying = () => {
      setPlaying(true);
      setBuffering(false);
      setPlayBlocked(false);
    };
    const handlePause = () => setPlaying(false);
    const handleWaiting = () => setBuffering(true);
    const handleError = () => {
      setBuffering(true);
      onVideoReady?.(false);
      hlsRef.current?.startLoad();
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('error', handleError);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', handleReady, { once: true });
      setQualityOptions([]);
      return () => {
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadedmetadata', handleReady);
        video.removeAttribute('src');
        video.load();
      };
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 20,
        liveSyncDurationCount: 3,
        startLevel: -1,
      });

      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const levels = hls.levels
          .map((level, index) => ({
            label: qualityLabel(level.height, level.bitrate),
            level: index,
          }))
          .filter((level, index, arr) => arr.findIndex((item) => item.label === level.label) === index);
        setQualityOptions([{ label: 'Auto', level: -1 }, ...levels]);
        handleReady();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setSelectedLevel(hls.autoLevelEnabled ? -1 : data.level);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        try {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else hls.startLoad();
          setBuffering(true);
        } catch {
          handleError();
        }
      });

      return () => {
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('error', handleError);
        hls.destroy();
        hlsRef.current = null;
      };
    }

    setBuffering(false);
    onVideoReady?.(false);
    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('error', handleError);
    };
  }, [actuallyMuted, isVisible, normalizedVolume, onMutedChange, onPlaybackBlocked, onVideoReady, src]);

  useEffect(() => {
    if (!playing) {
      setShowControls(true);
      return;
    }
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 2600);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [playing, showControls]);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playing) hideTimerRef.current = setTimeout(() => setShowControls(false), 2600);
  }, [playing]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setPlayBlocked(false)).catch(() => {
        setPlayBlocked(true);
        onPlaybackBlocked?.();
      });
    } else {
      video.pause();
    }
  }, [onPlaybackBlocked]);

  const toggleMuted = useCallback(() => {
    const nextVolume = normalizedVolume > 0 ? normalizedVolume : 0.6;
    const nextMuted = !actuallyMuted;
    if (normalizedVolume <= 0) onVolumeChange(nextVolume);
    onMutedChange(nextMuted);
    if (!nextMuted) {
      videoRef.current?.play().catch(() => {
        setPlayBlocked(true);
        onPlaybackBlocked?.();
      });
    }
  }, [actuallyMuted, normalizedVolume, onMutedChange, onPlaybackBlocked, onVolumeChange]);

  const changeVolume = useCallback((value: number) => {
    const nextVolume = Math.max(0, Math.min(1, value));
    onVolumeChange(nextVolume);
    onMutedChange(nextVolume === 0);
    if (nextVolume > 0) {
      videoRef.current?.play().catch(() => {
        setPlayBlocked(true);
        onPlaybackBlocked?.();
      });
    }
  }, [onMutedChange, onPlaybackBlocked, onVolumeChange]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().catch(() => setTheaterOpen(true));
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      setTheaterOpen(true);
    }
  }, []);

  const chooseQuality = useCallback((level: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = level;
    setSelectedLevel(level);
    setShowQuality(false);
    revealControls();
  }, [revealControls]);

  const openTheater = useCallback(() => {
    videoRef.current?.pause();
    setTheaterOpen(true);
  }, []);

  const closeTheater = useCallback(() => {
    setTheaterOpen(false);
    setTimeout(() => {
      videoRef.current?.play().catch(() => {});
    }, 80);
  }, []);

  const controls = (
    <div
      data-live-controls
      className={cn(
        'absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-200',
        showControls || !playing || playBlocked ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex items-start justify-between gap-3 bg-gradient-to-b from-black/65 to-transparent p-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow">
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

        {!theaterChild && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openTheater();
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/25"
            aria-label="Xem live trong theater mode"
          >
            <ScreenShare className="h-3.5 w-3.5" />
            Xem live
          </button>
        )}
      </div>

      {playBlocked && (
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              togglePlay();
            }}
            className="rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/80"
            aria-label="Nhấn để xem trực tiếp"
          >
            Nhấn để xem trực tiếp
          </button>
        </div>
      )}

      {!playBlocked && <div className="flex-1" />}

      <div className="bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-9">
        <div className="mb-2 truncate text-xs font-medium text-white/85">
          {hostName} đang phát trực tiếp
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              togglePlay();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15"
            aria-label={playing ? 'Tạm dừng live' : 'Phát live'}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>

          <div className="flex items-center gap-2 rounded-full bg-black/35 px-2 py-1 backdrop-blur">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleMuted();
              }}
              className="flex h-8 w-8 items-center justify-center text-white hover:text-primary"
              aria-label={actuallyMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            >
              {actuallyMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={actuallyMuted ? 0 : normalizedVolume}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => changeVolume(Number(event.target.value))}
              className="h-1 w-20 cursor-pointer accent-primary sm:w-24"
              aria-label="Âm lượng live"
            />
          </div>

          <div className="flex-1" />

          {canChooseQuality && (
            <div className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowQuality((value) => !value);
                }}
                className="flex h-9 items-center gap-1 rounded-full px-2 text-xs font-semibold text-white hover:bg-white/15"
                aria-label="Chọn chất lượng live"
              >
                <Settings className="h-4 w-4" />
                {selectedLevel === -1
                  ? 'Auto'
                  : qualityOptions.find((option) => option.level === selectedLevel)?.label || 'Auto'}
              </button>
              {showQuality && (
                <div
                  className="absolute bottom-11 right-0 min-w-28 rounded-lg border border-white/10 bg-black/90 p-1 text-sm text-white shadow-xl backdrop-blur"
                  onClick={(event) => event.stopPropagation()}
                >
                  {sortedQualityOptions.map((option) => (
                    <button
                      key={`${option.level}-${option.label}`}
                      type="button"
                      onClick={() => chooseQuality(option.level)}
                      className={cn(
                        'block w-full rounded px-3 py-1.5 text-left hover:bg-white/10',
                        selectedLevel === option.level && 'bg-primary text-primary-foreground',
                      )}
                      aria-label={`Chọn chất lượng ${option.label}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {onWatchLive && !theaterChild && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onWatchLive();
              }}
              className="hidden rounded-full bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25 sm:inline-flex"
              aria-label="Mở trang live"
            >
              Trang live
            </button>
          )}

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleFullscreen();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15"
            aria-label={fullscreen ? 'Thoát toàn màn hình' : 'Phóng to toàn màn hình'}
          >
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        ref={containerRef}
        className={cn('absolute inset-0 bg-black', theaterChild && 'relative h-full w-full')}
        onMouseMove={revealControls}
        onTouchStart={revealControls}
        onClick={(event) => {
          event.stopPropagation();
          if ((event.target as HTMLElement).closest('[data-live-controls]')) return;
          revealControls();
        }}
      >
        {isVisible && (
          <video
            ref={videoRef}
            muted={actuallyMuted}
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        )}

        {(buffering || !ready) && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/35">
            <Loader2 className="h-8 w-8 animate-spin text-white/80" />
          </div>
        )}

        {controls}
      </div>

      {theaterOpen && !theaterChild && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Theater live player"
          onClick={closeTheater}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              closeTheater();
            }}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Đóng theater live"
          >
            <X className="h-5 w-5" />
          </button>

          <div
            className="relative aspect-video w-full max-w-6xl overflow-hidden rounded-lg bg-black shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <LiveFeedVideoPlayer
              src={src}
              hostName={hostName}
              viewerCount={viewerCount}
              muted={muted}
              volume={volume}
              onMutedChange={onMutedChange}
              onVolumeChange={onVolumeChange}
              onPlaybackBlocked={onPlaybackBlocked}
              onWatchLive={onWatchLive}
              theaterChild
            />
          </div>
        </div>
      )}
    </>
  );
}
```

## 6. Integration vào LivePostEmbed

File: `src/components/feed/LivePostEmbed.tsx`

Source code hiện tại:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Radio, Video } from 'lucide-react';
import { LiveVideoPreview } from './LiveVideoPreview';
import { LiveVolumeControl } from './LiveVolumeControl';
import { LiveFeedVideoPlayer } from './LiveFeedVideoPlayer';

interface LivePostEmbedProps {
  metadata: {
    live_session_id?: string | null;
    live_status?: string | null;
    channel_name?: string | null;
    viewer_count?: number;
    thumbnail_url?: string | null;
    live_title?: string | null;
    live_mode?: 'agora_webcam' | 'rtmp_obs' | null;
    hls_url?: string | null;
    playback_url?: string | null;
  };
  hostName: string;
}

export const LivePostEmbed = ({ metadata, hostName }: LivePostEmbedProps) => {
  const navigate = useNavigate();
  const sessionId = metadata.live_session_id;
  const viewerCount = metadata.viewer_count ?? 0;
  const thumbnailUrl = metadata.thumbnail_url;
  const isRtmp = metadata.live_mode === 'rtmp_obs';
  const hlsUrl = metadata.hls_url || metadata.playback_url || null;
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [needsUserGesture, setNeedsUserGesture] = useState(false);

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
    if (sessionId) navigate(`/live/${sessionId}`);
  }, [navigate, sessionId]);

  const onVideoReady = useCallback((ready: boolean) => {
    setIsVideoReady(ready);
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

  return (
    <div
      className="group relative aspect-video w-full cursor-pointer overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black"
      onClick={isRtmp ? undefined : handleWatchLive}
    >
      {sessionId && isRtmp && hlsUrl && (
        <LiveFeedVideoPlayer
          src={hlsUrl}
          hostName={hostName}
          viewerCount={viewerCount}
          muted={muted || volume <= 0}
          volume={volume}
          onMutedChange={changeMuted}
          onVolumeChange={changeVolume}
          onVideoReady={onVideoReady}
          onPlaybackBlocked={() => setNeedsUserGesture(true)}
          onWatchLive={handleWatchLive}
        />
      )}

      {sessionId && !isRtmp && (
        <LiveVideoPreview
          sessionId={sessionId}
          muted={muted || volume <= 0}
          volume={volume}
          onVideoReady={onVideoReady}
        />
      )}

      {!isRtmp && !isVideoReady && (
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

      {!isRtmp && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />}

      {!isRtmp && (
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
      )}

      {!isRtmp && isVideoReady && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="rounded-full bg-black/50 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
            Nhấn để xem trực tiếp
          </span>
        </div>
      )}

      {!isRtmp && !isVideoReady && !sessionId && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600/90 shadow-lg shadow-red-600/30 transition-transform group-hover:scale-110">
            <Radio className="h-8 w-8 text-white" />
          </div>
          <span className="rounded-full bg-black/40 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
            Xem trực tiếp
          </span>
        </div>
      )}

      {!isRtmp && (
        <div className="absolute bottom-3 left-3 right-3 z-10">
          <p className="max-w-[60%] truncate text-xs text-white/80 sm:max-w-[70%]">
            {hostName} đang phát trực tiếp
          </p>
        </div>
      )}

      {!isRtmp && (
        <LiveVolumeControl
          muted={muted}
          volume={volume}
          onToggleMuted={toggleMuted}
          onVolumeChange={changeVolume}
          needsUserGesture={needsUserGesture}
        />
      )}
    </div>
  );
};
```

## 7. Control behavior

### Play / Pause

- Nếu video đang play: bấm pause sẽ dừng.
- Nếu đang pause: bấm play sẽ phát lại.
- Nếu browser chặn autoplay: hiện nút “Nhấn để xem trực tiếp”.

### Volume

- `muted=true` hoặc `volume=0` coi như tắt tiếng.
- Kéo volume > 0 sẽ tự unmute.
- Preference lưu bằng:

```ts
localStorage.setItem('funprofile_live_muted', String(nextMuted));
localStorage.setItem('funprofile_live_volume', String(volume));
```

### Fullscreen

- Dùng Fullscreen API:

```ts
container.requestFullscreen()
document.exitFullscreen()
```

- Nếu fullscreen fail hoặc không hỗ trợ: fallback mở theater modal.

### Theater mode

- Nút “Xem live” mở modal nền tối.
- Video lớn ở giữa.
- Có nút đóng.
- Không làm mất feed state.

### Quality selector

- Chỉ hiện khi HLS.js detect được nhiều levels.
- Auto = `hls.currentLevel = -1`.
- Level cụ thể = `hls.currentLevel = level`.
- Native HLS/Safari không show selector nếu không detect được levels.

## 8. Không phá replay R2

Replay R2 hiện tại vẫn đi theo:

- `PostMedia`
- `MediaGrid`
- `ReplayPlayer`
- R2 MP4 URL

Tính năng mới chỉ thay RTMP live feed player trong `LivePostEmbed`.

## 9. Accessibility

Đã có aria-label cho:

- Play/Pause.
- Mute/Unmute.
- Volume slider.
- Fullscreen.
- Theater mode.
- Quality selector.
- Close theater.

## 10. Test checklist

1. Mở feed có RTMP live.
2. Video autoplay muted.
3. Bấm play/pause hoạt động.
4. Bấm mute/unmute hoạt động.
5. Kéo volume hoạt động.
6. Reload trang vẫn nhớ volume/mute.
7. Bấm fullscreen hoạt động.
8. Nếu fullscreen không hỗ trợ, theater mode vẫn mở.
9. Bấm “Xem live” mở theater modal.
10. Bấm đóng theater trở lại feed.
11. Quality selector chỉ hiện khi HLS.js detect được levels.
12. Nếu browser chặn autoplay, hiện “Nhấn để xem trực tiếp”.
13. Mobile tap hiện controls.
14. Viewer count hiển thị đúng nếu metadata có.
15. Replay R2 vẫn phát bình thường.
16. Live ended không loading vô hạn.

## 11. Verification

Đã chạy:

```bash
npx tsc --noEmit
```

Kết quả: pass.

## 12. Rollback

Rollback nhanh:

1. Trong `LivePostEmbed.tsx`, đổi RTMP live từ `LiveFeedVideoPlayer` về `RtmpHlsPreview`.
2. Xóa import `LiveFeedVideoPlayer`.
3. Giữ `LiveVolumeControl` cũ.
4. Có thể giữ file `LiveFeedVideoPlayer.tsx` không dùng, hoặc xóa sau.

## 13. Files changed

- `src/components/feed/LiveFeedVideoPlayer.tsx`
- `src/components/feed/LivePostEmbed.tsx`

