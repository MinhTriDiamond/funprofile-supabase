import { useState, useEffect, useCallback, memo } from 'react';
import { Music, Volume2, Film, Play, Pause, ListMusic, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import * as GA from '@/lib/globalAudio';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';

interface ValentineMusicButtonProps {
  variant?: 'desktop' | 'mobile';
}

const formatTime = (sec: number) => {
  if (!isFinite(sec) || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const PopoverInner = ({ navigate }: { navigate: ReturnType<typeof useNavigate> }) => {
  const { t } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(() => GA.getState().playing);
  const [volume, setVolume] = useState(() => GA.getState().volume);
  const [currentTrackId, setCurrentTrackId] = useState(() => GA.getState().currentTrackId);
  const [currentTime, setCurrentTime] = useState(() => GA.getState().currentTime);
  const [duration, setDuration] = useState(() => GA.getState().duration);

  useEffect(() => {
    return GA.subscribe(() => {
      const s = GA.getState();
      setIsPlaying(s.playing);
      setVolume(s.volume);
      setCurrentTrackId(s.currentTrackId);
      setCurrentTime(s.currentTime);
      setDuration(s.duration);
    });
  }, []);

  const toggle = useCallback(() => GA.toggle(), []);
  const handleVolumeChange = useCallback((val: number[]) => GA.setVolume(val[0]), []);
  const handleSeek = useCallback((val: number[]) => GA.seek(val[0]), []);
  const handleSelectTrack = useCallback((trackId: string) => {
    GA.setTrack(trackId);
    if (!GA.getState().playing) GA.play();
  }, []);

  const volumePercent = Math.round(volume * 100);
  const hasDuration = duration > 0 && isFinite(duration);

  return (
    <>
      {/* Play/Pause */}
      <button
        onClick={toggle}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        <span>{isPlaying ? t('musicPause') : t('musicPlay')}</span>
      </button>

      {/* Progress */}
      <div className="space-y-1">
        <Slider
          value={[Math.min(currentTime, hasDuration ? duration : 0)]}
          onValueChange={handleSeek}
          max={hasDuration ? duration : 1}
          step={0.1}
          disabled={!hasDuration}
          className="flex-1"
        />
        <div className="flex items-center justify-between text-[10px] font-medium tabular-nums text-muted-foreground px-0.5">
          <span>{formatTime(currentTime)}</span>
          <span>{hasDuration ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 shrink-0 text-destructive" />
        <Slider value={[volume]} onValueChange={handleVolumeChange} max={1} step={0.05} className="flex-1" />
        <span className="text-xs font-semibold text-foreground min-w-[28px] text-right">{volumePercent}%</span>
      </div>

      {/* Track selector */}
      <div className="border-t border-border pt-2 space-y-1">
        <div className="flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ListMusic className="w-3 h-3" />
          <span>{t('musicSelectTrack')}</span>
        </div>
        <div className="space-y-0.5">
          {GA.TRACKS.map((track) => {
            const selected = track.id === currentTrackId;
            return (
              <button
                key={track.id}
                type="button"
                onClick={() => handleSelectTrack(track.id)}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors text-left',
                  selected
                    ? 'bg-destructive/10 text-destructive font-medium'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <span className="flex-1 truncate">{track.name}</span>
                {selected ? (
                  <span className="flex items-center gap-1 shrink-0">
                    {isPlaying && (
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                    )}
                    <Check className="w-3.5 h-3.5" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Xem Video */}
      <button
        onClick={() => navigate('/reels')}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors border-t border-border pt-2"
      >
        <Film className="w-4 h-4" />
        <span>Xem Video</span>
      </button>
    </>
  );
};

export const ValentineMusicButton = memo(({ variant = 'desktop' }: ValentineMusicButtonProps) => {
  const { t } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(() => GA.getState().playing);
  const navigate = useNavigate();

  useEffect(() => {
    return GA.subscribe(() => {
      setIsPlaying(GA.getState().playing);
    });
  }, []);

  const triggerButton = (
    <button
      aria-label={t('musicControl')}
      className={`fun-icon-btn-gold group relative ${isPlaying ? 'ring-2 ring-destructive/50' : ''}`}
    >
      <Music
        className={`w-5 h-5 ${
          isPlaying
            ? 'text-destructive drop-shadow-[0_0_6px_rgba(220,38,38,0.5)] animate-spin'
            : 'text-gold drop-shadow-[0_0_6px_hsl(48_96%_53%/0.5)] group-hover:drop-shadow-[0_0_12px_hsl(48_96%_53%/0.8)] transition-all duration-300'
        }`}
        style={isPlaying ? { animationDuration: '2s' } : undefined}
      />
      {isPlaying && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-destructive rounded-full animate-pulse" />}
    </button>
  );

  if (variant === 'mobile') {
    return (
      <Popover>
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
        <PopoverContent side="top" className="w-64 p-3 space-y-3" align="center">
          <PopoverInner navigate={navigate} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent side="bottom" className="w-64 p-3 space-y-3" align="end">
        <PopoverInner navigate={navigate} />
      </PopoverContent>
    </Popover>
  );
});

ValentineMusicButton.displayName = 'ValentineMusicButton';
