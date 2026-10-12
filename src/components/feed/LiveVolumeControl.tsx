import { useId } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Volume2, VolumeX } from 'lucide-react';

interface LiveVolumeControlProps {
  muted: boolean;
  volume: number;
  onToggleMuted: () => void;
  onVolumeChange: (volume: number) => void;
  needsUserGesture?: boolean;
}

export const LiveVolumeControl = ({
  muted,
  volume,
  onToggleMuted,
  onVolumeChange,
  needsUserGesture = false,
}: LiveVolumeControlProps) => {
  const { t } = useLanguage();
  const sliderId = useId();
  const effectiveMuted = muted || volume <= 0;
  const toggleLabel = effectiveMuted ? t('unmuteSound') : t('muteSound');

  return (
    <div
      className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1.5 text-white shadow-lg backdrop-blur-sm"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      aria-label={t('lvcControls')}
    >
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        onClick={onToggleMuted}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        {effectiveMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <label className="sr-only" htmlFor={sliderId}>{t('soundVolume')}</label>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={100}
        step={1}
        value={effectiveMuted ? 0 : Math.round(volume * 100)}
        onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
        className="h-8 w-24 cursor-pointer accent-white sm:w-28"
        aria-label={t('soundVolume')}
        title={t('soundVolume')}
      />
      {needsUserGesture && (
        <span className="hidden whitespace-nowrap text-[11px] font-medium text-white/90 sm:inline">
          {t('lvcTapToUnmute')}
        </span>
      )}
    </div>
  );
};
