import { ReplayPlayer } from '@/components/ui/ReplayPlayer';

interface PortraitVideoBackdropProps {
  src: string;
  muted: boolean;
  volume: number;
  paused: boolean;
  live?: boolean;
  onPlaybackBlocked?: () => void;
}

export function PortraitVideoBackdrop({ src, muted, volume, paused, live, onPlaybackBlocked }: PortraitVideoBackdropProps) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <ReplayPlayer
        src={src}
        className="absolute inset-0 h-full w-full scale-110 opacity-45 blur-2xl [&_video]:!object-cover"
        autoPlay
        muted
        volume={0}
        paused={paused}
        controls={false}
        live={live}
      />
      <div className="absolute inset-0 bg-black/45" />
      <ReplayPlayer
        src={src}
        className="absolute inset-0 z-10 h-full w-full bg-transparent [&_video]:!object-contain"
        autoPlay
        muted={muted}
        volume={volume}
        paused={paused}
        controls={false}
        live={live}
        onPlaybackBlocked={onPlaybackBlocked}
      />
    </div>
  );
}
