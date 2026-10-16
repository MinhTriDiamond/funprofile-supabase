import type React from 'react';
import { Loader2, RadioTower } from 'lucide-react';
import { LiveViewerControls } from '@/components/feed/LiveViewerControls';
import { ReplayPlayer } from '@/components/ui/ReplayPlayer';

interface LivePreviewPlayerProps {
  containerRef?: React.RefObject<HTMLDivElement>;
  canShowPreview: boolean;
  creating?: boolean;
  livePreviewKey: string;
  livePreviewSrc: string | null;
  playbackUrl: string | null;
  previewMuted: boolean;
  previewVolume: number;
  previewPaused: boolean;
  previewNeedsGesture: boolean;
  waitingTitle?: string;
  waitingDescription?: string;
  onFirstFrame: () => void;
  onError: (error: Error) => void;
  onPlaybackBlocked: () => void;
  onToggleMuted: () => void;
  onVolumeChange: (volume: number) => void;
  onTogglePlay: () => void;
  onFullscreen: () => void;
}

export function LivePreviewPlayer({
  containerRef,
  canShowPreview,
  creating = false,
  livePreviewKey,
  livePreviewSrc,
  playbackUrl,
  previewMuted,
  previewVolume,
  previewPaused,
  previewNeedsGesture,
  waitingTitle = 'Kết nối phần mềm phát trực tiếp để lên sóng',
  waitingDescription = 'Mở phần mềm phát, nhập Server URL và Stream Key, sau đó bấm Start Streaming.',
  onFirstFrame,
  onError,
  onPlaybackBlocked,
  onToggleMuted,
  onVolumeChange,
  onTogglePlay,
  onFullscreen,
}: LivePreviewPlayerProps) {
  return (
    <div ref={containerRef} className="aspect-video bg-black relative rounded-lg overflow-hidden border">
      {canShowPreview ? (
        <ReplayPlayer
          key={livePreviewKey}
          src={livePreviewSrc || playbackUrl}
          className="h-full w-full"
          autoPlay
          muted={previewMuted || previewVolume <= 0}
          volume={previewVolume}
          controls={false}
          live
          paused={previewPaused}
          onFirstFrame={onFirstFrame}
          onError={onError}
          onPlaybackBlocked={onPlaybackBlocked}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 text-center px-6">
          {creating ? <Loader2 className="h-8 w-8 animate-spin mb-3" /> : <RadioTower className="h-10 w-10 mb-3" />}
          <div className="font-semibold">{waitingTitle}</div>
          <div className="text-sm text-white/70 mt-1 max-w-md">{waitingDescription}</div>
        </div>
      )}
      {canShowPreview && (
        <LiveViewerControls
          muted={previewMuted}
          volume={previewVolume}
          paused={previewPaused}
          onToggleMuted={onToggleMuted}
          onVolumeChange={onVolumeChange}
          onTogglePlay={onTogglePlay}
          onFullscreen={onFullscreen}
          needsUserGesture={previewNeedsGesture}
        />
      )}
    </div>
  );
}
