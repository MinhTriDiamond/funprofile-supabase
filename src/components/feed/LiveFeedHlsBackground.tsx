import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2 } from 'lucide-react';

interface LiveFeedHlsBackgroundProps {
  src: string;
  muted: boolean;
  volume: number;
  paused?: boolean;
  fitMode?: 'cover' | 'contain';
  onVideoReady?: (ready: boolean) => void;
  onPlaybackBlocked?: () => void;
  onMutedChange?: (muted: boolean) => void;
  onVideoDimensions?: (dimensions: { width: number; height: number }) => void;
}

/**
 * Player HLS tối giản cho live trong feed: chỉ phát video, không render controls.
 * Mọi UI overlay (LIVE badge, viewer count, volume) do component cha (LivePostEmbed) đảm nhận.
 */
export function LiveFeedHlsBackground({
  src,
  muted,
  volume,
  paused = false,
  fitMode = 'cover',
  onVideoReady,
  onPlaybackBlocked,
  onMutedChange,
  onVideoDimensions,
}: LiveFeedHlsBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [ready, setReady] = useState(false);

  const normalizedVolume = Math.max(0, Math.min(1, volume));
  const actuallyMuted = muted || normalizedVolume === 0;

  // Stable refs để effect HLS không tear-down khi parent re-render.
  const onVideoReadyRef = useRef(onVideoReady);
  const onPlaybackBlockedRef = useRef(onPlaybackBlocked);
  const onMutedChangeRef = useRef(onMutedChange);
  const onVideoDimensionsRef = useRef(onVideoDimensions);
  const mutedRef = useRef(actuallyMuted);
  const volumeRef = useRef(normalizedVolume);

  useEffect(() => {
    onVideoReadyRef.current = onVideoReady;
    onPlaybackBlockedRef.current = onPlaybackBlocked;
    onMutedChangeRef.current = onMutedChange;
    onVideoDimensionsRef.current = onVideoDimensions;
    mutedRef.current = actuallyMuted;
    volumeRef.current = normalizedVolume;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.45 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Đồng bộ volume/muted không cần tái tạo HLS.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = normalizedVolume;
    video.muted = actuallyMuted;
    if (paused) {
      video.pause();
      return;
    }
    if (!actuallyMuted && video.paused && ready) {
      video.play().catch(() => onPlaybackBlockedRef.current?.());
    }
  }, [actuallyMuted, normalizedVolume, paused, ready]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !isVisible) return;

    setReady(false);
    onVideoReadyRef.current?.(false);

    const reportDimensions = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        onVideoDimensionsRef.current?.({ width: video.videoWidth, height: video.videoHeight });
      }
    };

    const handleReady = () => {
      reportDimensions();
      setReady(true);
      onVideoReadyRef.current?.(true);
      video.muted = mutedRef.current;
      video.volume = volumeRef.current;
      if (paused) {
        video.pause();
        return;
      }
      video.play().catch(() => {
        video.muted = true;
        onMutedChangeRef.current?.(true);
        video.play().catch(() => onPlaybackBlockedRef.current?.());
      });
    };

    const handleError = () => {
      hlsRef.current?.startLoad();
    };
    video.addEventListener('loadedmetadata', reportDimensions);
    video.addEventListener('error', handleError);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', handleReady, { once: true });
      return () => {
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadedmetadata', handleReady);
        video.removeEventListener('loadedmetadata', reportDimensions);
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
      hls.on(Hls.Events.MANIFEST_PARSED, handleReady);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        try {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else hls.startLoad();
        } catch {
          handleError();
        }
      });
      return () => {
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadedmetadata', reportDimensions);
        hls.destroy();
        hlsRef.current = null;
      };
    }

    return () => {
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadedmetadata', reportDimensions);
    };
  }, [isVisible, paused, src]);

  return (
    <div ref={containerRef} className="absolute inset-0 h-full w-full">
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full ${fitMode === 'contain' ? 'object-contain' : 'object-cover'}`}
        playsInline
        autoPlay
        muted={actuallyMuted}
      />
      {isVisible && !ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        </div>
      )}
    </div>
  );
}
