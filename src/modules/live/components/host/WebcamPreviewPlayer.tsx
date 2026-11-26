import { Loader2, WifiOff } from 'lucide-react';
import type { RefCallback } from 'react';
import type { HostLiveUiState } from './hostLiveTypes';
import { LiveFloatingReactions } from './LiveFloatingReactions';
import type { LiveReaction } from '../../hooks/useLiveReactions';

interface WebcamPreviewPlayerProps {
  setLocalContainerRef: RefCallback<HTMLDivElement>;
  isJoined: boolean;
  statusText: string;
  uiState: HostLiveUiState;
  reactions: LiveReaction[];
  liveDuration: string;
  viewerCount: number;
  reactionCount: number;
}

export function WebcamPreviewPlayer({ setLocalContainerRef, isJoined, statusText, uiState, reactions }: WebcamPreviewPlayerProps) {
  const connecting = !isJoined || uiState === 'reconnecting';
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-media shadow-sm">
      <div data-testid="host-camera-frame" className="relative aspect-video bg-media">
        <div ref={setLocalContainerRef} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:!object-contain [&_video]:!object-center" />
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground">{uiState === 'live' ? 'LIVE' : 'Đang kết nối'}</div>
        {connecting && <div className="absolute inset-0 z-30 flex items-center justify-center bg-media/90 p-5 text-center text-media-foreground"><div className="max-w-sm">
          {uiState === 'reconnecting' ? <WifiOff className="mx-auto mb-3 h-7 w-7" /> : <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin" />}
          <p className="font-semibold">{uiState === 'reconnecting' ? 'Đang khôi phục tín hiệu live…' : statusText}</p>
          <p className="mt-2 text-sm opacity-80">Đang kiểm tra kết nối camera và micro.</p>
        </div></div>}
        <LiveFloatingReactions reactions={reactions} />
      </div>
    </div>
  );
}
