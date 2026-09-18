import { useRef, useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Play, Pause } from 'lucide-react';

interface ReelPlayerProps {
  videoUrl: string;
  isActive: boolean;
  isMuted: boolean;
  preload?: 'none' | 'metadata' | 'auto';
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const ReelPlayer = ({ videoUrl, isActive, isMuted, preload = 'metadata' }: ReelPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayPause, setShowPlayPause] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || hasError) return;

    if (isActive) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
    }
  }, [isActive, hasError]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && !isDragging) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, [isDragging]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const togglePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }

    setShowPlayPause(true);
    clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setShowPlayPause(false), 800);
  }, []);

  const seekTo = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const video = videoRef.current;
    if (!bar || !video || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  const handleProgressClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    seekTo(e.clientX);
  }, [seekTo]);

  const handleProgressDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    seekTo(clientX);

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      seekTo(cx);
    };
    const onEnd = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onEnd);
  }, [seekTo]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (hasError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-background text-foreground gap-3">
        <AlertTriangle className="w-12 h-12 text-yellow-400" />
        <p className="text-sm text-muted-foreground">Video không thể tải được</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" onClick={togglePlayPause}>
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-contain"
        loop
        playsInline
        muted={isMuted}
        preload={preload}
        onError={() => setHasError(true)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Play/Pause overlay */}
      {showPlayPause && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            {isPlaying ? (
              <Pause className="w-8 h-8 text-white" fill="white" />
            ) : (
              <Play className="w-8 h-8 text-white ml-1" fill="white" />
            )}
          </div>
        </div>
      )}

      {/* Bottom controls: time + progress bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20" onClick={(e) => e.stopPropagation()}>
        {/* Time display */}
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-white/80 text-[10px] font-medium drop-shadow-lg">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Progress bar */}
        <div
          ref={progressRef}
          className="relative h-6 flex items-end cursor-pointer group"
          onClick={handleProgressClick}
          onMouseDown={handleProgressDragStart}
          onTouchStart={handleProgressDragStart}
        >
          <div className="w-full h-[3px] group-hover:h-[5px] transition-all bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Drag handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
      </div>
    </div>
  );
};

export default ReelPlayer;
