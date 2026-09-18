import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ReplayPlayer } from '@/components/ui/ReplayPlayer';

interface RtmpHlsPreviewProps {
  src: string;
  muted: boolean;
  volume: number;
  onVideoReady?: (ready: boolean) => void;
  onPlaybackBlocked?: () => void;
}

/**
 * HLS preview cho phiên live RTMP/OBS nhúng trong feed.
 * Chỉ tải HLS khi >=50% lọt vào viewport, unmount khi cuộn ra ngoài.
 */
export const RtmpHlsPreview = ({ src, muted, volume, onVideoReady, onPlaybackBlocked }: RtmpHlsPreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) {
      setIsReady(false);
      onVideoReady?.(false);
    }
  }, [isVisible, onVideoReady]);

  const handleReady = () => {
    setIsReady(true);
    onVideoReady?.(true);
  };

  const handleError = () => {
    setIsReady(false);
    onVideoReady?.(false);
  };

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full">
      {isVisible && (
        <ReplayPlayer
          src={src}
          className="absolute inset-0 w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full"
          autoPlay
          muted={muted}
          volume={volume}
          controls={false}
          live
          onReady={handleReady}
          onError={handleError}
          onPlaybackBlocked={onPlaybackBlocked}
        />
      )}
      {isVisible && !isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
          <Loader2 className="w-8 h-8 animate-spin text-white/70" />
        </div>
      )}
    </div>
  );
};
