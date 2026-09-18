import { memo, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReplayPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  volume?: number;
  controls?: boolean;
  loop?: boolean;
  live?: boolean;
  paused?: boolean;
  onReady?: () => void;
  onError?: (error: Error) => void;
  onPlaybackBlocked?: () => void;
}

const MAX_CONSECUTIVE_ERRORS = 3;

export const ReplayPlayer = memo(({
  src,
  poster,
  className,
  autoPlay = false,
  muted = false,
  volume = 1,
  controls = true,
  loop = false,
  live = false,
  paused = false,
  onReady,
  onError,
  onPlaybackBlocked,
}: ReplayPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const errorCountRef = useRef(0);
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const onPlaybackBlockedRef = useRef(onPlaybackBlocked);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mutedRef.current = muted;
    volumeRef.current = volume;
    onPlaybackBlockedRef.current = onPlaybackBlocked;
  }, [muted, volume, onPlaybackBlocked]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const normalizedVolume = Math.max(0, Math.min(1, volume));
    video.volume = normalizedVolume;
    video.muted = muted || normalizedVolume === 0;
    if (paused) {
      video.pause();
      return;
    }
    if (autoPlay && !video.muted && video.paused) {
      video.play().catch(() => {
        onPlaybackBlocked?.();
      });
    }
  }, [autoPlay, muted, paused, volume, onPlaybackBlocked]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setLoading(true);
    setBuffering(false);
    setError(null);
    errorCountRef.current = 0;

    const clearError = () => {
      errorCountRef.current = 0;
      setError(null);
    };

    const handleReady = () => {
      setLoading(false);
      onReady?.();
      if (autoPlay && !paused) {
        const normalizedVolume = Math.max(0, Math.min(1, volumeRef.current));
        video.muted = mutedRef.current || normalizedVolume === 0;
        video.volume = normalizedVolume;
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {
            onPlaybackBlockedRef.current?.();
          });
        });
      }
    };
    const handleWaiting = () => setBuffering(true);
    const handlePlaying = () => {
      setLoading(false);
      setBuffering(false);
      clearError();
    };
    const handleSeeked = () => {
      // Sau khi tua, nếu phát được tiếp thì xoá lỗi tạm
      setBuffering(false);
    };
    const handleFatalError = () => {
      errorCountRef.current += 1;
      if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
        const message = 'Replay playback error';
        setLoading(false);
        setError(message);
        onError?.(new Error(message));
      } else {
        // Giữ overlay loading, chờ player phục hồi
        setBuffering(true);
      }
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handlePlaying);
    video.addEventListener('seeked', handleSeeked);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', handleReady, { once: true });
      const nativeError = () => {
        // Native HLS (Safari/iOS): khi seek vào segment chưa load có thể bắn error
        // → đếm và chỉ show lỗi sau nhiều lần liên tiếp
        handleFatalError();
      };
      video.addEventListener('error', nativeError);

      return () => {
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('canplay', handlePlaying);
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('loadedmetadata', handleReady);
        video.removeEventListener('error', nativeError);
        video.removeAttribute('src');
        video.load();
      };
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: live,
        backBufferLength: live ? 10 : 30,
        maxBufferLength: live ? 8 : 30,
        maxMaxBufferLength: live ? 20 : 90,
        manifestLoadingMaxRetry: live ? 20 : 4,
        manifestLoadingRetryDelay: live ? 500 : 1000,
        manifestLoadingMaxRetryTimeout: live ? 2000 : 64000,
        levelLoadingMaxRetry: live ? 20 : 4,
        levelLoadingRetryDelay: live ? 500 : 1000,
        fragLoadingMaxRetry: live ? 12 : 6,
        fragLoadingRetryDelay: live ? 500 : 1000,
        startLevel: -1,
        ...(live ? {
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
        } : {}),
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, handleReady);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        // Mọi fatal đều thử recover trước khi cho hiển thị lỗi
        try {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            setBuffering(true);
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            setBuffering(true);
            return;
          }
          // Các fatal khác (bufferStalledError, internalException, …)
          hls.startLoad();
          handleFatalError();
        } catch {
          handleFatalError();
        }
      });

      return () => {
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('canplay', handlePlaying);
        video.removeEventListener('seeked', handleSeeked);
        hls.destroy();
        hlsRef.current = null;
      };
    }

    // Trình duyệt không hỗ trợ HLS
    setLoading(false);
    setError('Replay playback error');
    onError?.(new Error('Replay playback error'));
    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handlePlaying);
      video.removeEventListener('seeked', handleSeeked);
    };
  }, [src, autoPlay, paused, live, onReady, onError]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    errorCountRef.current = 0;
    const v = videoRef.current;
    if (v) {
      try { v.load(); v.play().catch(() => {}); } catch { /* ignore */ }
    }
  };

  return (
    <div className={cn('relative bg-black overflow-hidden', className)}>
      <video
        ref={videoRef}
        poster={poster}
        controls={controls}
        muted={muted}
        loop={loop}
        preload={live ? 'auto' : 'metadata'}
        playsInline
        crossOrigin="anonymous"
        className="w-full h-full object-contain"
      />
      {(loading || buffering) && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <Loader2 className="h-8 w-8 animate-spin text-white/80" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-sm text-white/80">
          <span>Không thể phát replay. Vui lòng thử lại.</span>
          <button
            type="button"
            onClick={handleRetry}
            className="px-4 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
          >
            Thử lại
          </button>
        </div>
      )}
    </div>
  );
});

ReplayPlayer.displayName = 'ReplayPlayer';
export default ReplayPlayer;
