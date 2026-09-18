import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import {
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveViewerControlsProps {
  muted: boolean;
  volume: number;
  paused: boolean;
  onToggleMuted: () => void;
  onVolumeChange: (volume: number) => void;
  onTogglePlay: () => void;
  onFullscreen?: () => void;
  onFloat?: () => void;
  needsUserGesture?: boolean;
  className?: string;
  compact?: boolean;
}

export const LiveViewerControls = ({
  muted,
  volume,
  paused,
  onToggleMuted,
  onVolumeChange,
  onTogglePlay,
  onFullscreen,
  onFloat,
  needsUserGesture = false,
  className,
  compact = false,
}: LiveViewerControlsProps) => {
  const sliderId = useId();
  const closeTimerRef = useRef<number | null>(null);
  const isDraggingVolumeRef = useRef(false);
  const isHoveringVolumeRef = useRef(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const effectiveMuted = muted || volume <= 0;
  const volumePercent = effectiveMuted ? 0 : Math.round(volume * 100);

  const stopControlEvent = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openVolume = () => {
    clearCloseTimer();
    isHoveringVolumeRef.current = true;
    setVolumeOpen(true);
  };

  const scheduleVolumeClose = () => {
    isHoveringVolumeRef.current = false;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      if (!isDraggingVolumeRef.current && !isHoveringVolumeRef.current) {
        setVolumeOpen(false);
      }
    }, 250);
  };

  const handleVolumeIconClick = () => {
    clearCloseTimer();
    setVolumeOpen((value) => !value);
  };

  const handleVolumeIconDoubleClick = () => {
    onToggleMuted();
    setVolumeOpen(true);
  };

  useEffect(() => {
    const finishDrag = () => {
      isDraggingVolumeRef.current = false;
      if (!isHoveringVolumeRef.current) scheduleVolumeClose();
    };

    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    window.addEventListener('blur', finishDrag);
    return () => {
      clearCloseTimer();
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      window.removeEventListener('blur', finishDrag);
    };
  }, []);

  return (
    <div
      className={cn(
        'absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-full bg-black/65 p-1.5 text-white shadow-lg backdrop-blur-md',
        compact && 'bottom-2 right-2 scale-95',
        className,
      )}
      onClick={stopControlEvent}
      onPointerDown={stopControlEvent}
      aria-label="Live viewer controls"
    >
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        onClick={onTogglePlay}
        aria-label={paused ? 'Phat live' : 'Tam dung live'}
        title={paused ? 'Phat live' : 'Tam dung live'}
      >
        {paused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
      </button>

      <div
        className="relative"
        onMouseEnter={openVolume}
        onMouseLeave={scheduleVolumeClose}
      >
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          onClick={handleVolumeIconClick}
          onDoubleClick={handleVolumeIconDoubleClick}
          aria-label="Mo dieu chinh am luong"
          title="Mo dieu chinh am luong"
        >
          {effectiveMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>

        {volumeOpen && (
          <div
            className={cn(
              'absolute bottom-12 right-0 flex flex-col items-center gap-2 rounded-2xl bg-black/85 px-3 py-3 text-white shadow-xl backdrop-blur-md before:absolute before:-bottom-4 before:right-0 before:h-5 before:w-16 before:content-[""]',
              compact ? 'h-36 w-14' : 'h-44 w-16',
            )}
            onMouseEnter={openVolume}
            onMouseLeave={scheduleVolumeClose}
            onClick={stopControlEvent}
            onPointerDown={stopControlEvent}
          >
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              onClick={onToggleMuted}
              aria-label={effectiveMuted ? 'Bat am thanh' : 'Tat am thanh'}
              title={effectiveMuted ? 'Bat am thanh' : 'Tat am thanh'}
            >
              {effectiveMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <div className={cn('relative flex flex-1 items-center justify-center', compact ? 'h-20' : 'h-28')}>
              <label className="sr-only" htmlFor={sliderId}>Am luong</label>
              <input
                id={sliderId}
                type="range"
                min={0}
                max={100}
                step={1}
                value={volumePercent}
                onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  isDraggingVolumeRef.current = true;
                  clearCloseTimer();
                  setVolumeOpen(true);
                }}
                className={cn(
                  'absolute h-10 cursor-pointer accent-white [touch-action:none]',
                  compact ? 'w-24' : 'w-32',
                )}
                style={{ transform: 'rotate(-90deg)' }}
                aria-label="Am luong"
                title="Am luong"
              />
            </div>
            <span className="min-w-9 rounded-full bg-white/10 px-2 py-0.5 text-center text-[11px] font-semibold tabular-nums">
              {volumePercent}%
            </span>
            {needsUserGesture && (
              <p className="w-12 text-center text-[10px] font-medium leading-tight text-white/80">Bam de bat tieng</p>
            )}
          </div>
        )}
      </div>

      {onFullscreen && (
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          onClick={onFullscreen}
          aria-label="Phong to"
          title="Phong to"
        >
          <Maximize className="h-4 w-4" />
        </button>
      )}

      {onFloat && (
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          onClick={onFloat}
          aria-label="Mo cua so noi"
          title="Mo cua so noi"
        >
          <PictureInPicture2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
