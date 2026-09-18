import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';

export interface SoundOption {
  id: string;
  name: string;
  file: string;
}

export const SOUND_OPTIONS: SoundOption[] = [
  { id: 'rich-1', name: 'Rich! Rich! Rich! (Bản 1)', file: '/sounds/rich-1.mp3' },
  { id: 'rich-2', name: 'Rich! Rich! Rich! (Bản 2)', file: '/sounds/rich-2.mp3' },
  { id: 'rich-3', name: 'Rich! Rich! Rich! (Bản 3)', file: '/sounds/rich-3.mp3' },
];

interface CardSoundSelectorProps {
  selectedSound: string;
  onSelectSound: (soundId: string) => void;
}

export const CardSoundSelector = ({
  selectedSound,
  onSelectSound,
}: CardSoundSelectorProps) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = (sound: SoundOption) => {
    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    if (playingId === sound.id) {
      setPlayingId(null);
      return;
    }

    const audio = new Audio(sound.file);
    audio.volume = 0.7;
    audioRef.current = audio;
    
    audio.play().catch(() => {});
    setPlayingId(sound.id);

    audio.onended = () => setPlayingId(null);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground block">
        <Volume2 className="w-4 h-4 inline mr-1" />
        Âm thanh:
      </label>
      <div className="space-y-1.5">
        {SOUND_OPTIONS.map((sound) => (
          <div
            key={sound.id}
            className={cn(
              'flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer',
              selectedSound === sound.id
                ? 'bg-primary/10 border-primary'
                : 'bg-muted/30 border-border hover:border-primary/50'
            )}
            onClick={() => onSelectSound(sound.id)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePreview(sound);
              }}
              className="p-1.5 rounded-full hover:bg-primary/20 transition-colors"
            >
              {playingId === sound.id ? (
                <Pause className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Play className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
            <span className={cn(
              'text-sm flex-1',
              selectedSound === sound.id ? 'font-medium text-primary' : 'text-muted-foreground'
            )}>
              {sound.name}
            </span>
            {selectedSound === sound.id && (
              <Volume2 className="w-4 h-4 text-primary" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
