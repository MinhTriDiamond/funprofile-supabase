import type { RefObject } from 'react';
import { Wifi } from 'lucide-react';
import { ReplayPlayer } from '@/components/ui/ReplayPlayer';
import { LiveViewerControls } from '@/components/feed/LiveViewerControls';
import { cn } from '@/lib/utils';
import { PortraitVideoBackdrop } from './PortraitVideoBackdrop';
import { LiveEndedReplayState } from './LiveEndedReplayState';
import type { LiveSession } from '../../types';

interface LiveVideoPlayerProps {
  session: LiveSession;
  state: 'live' | 'reconnecting' | 'ended' | 'processing_replay' | 'replay_ready' | 'failed';
  replayUrl?: string | null;
  remoteContainerRef: RefObject<HTMLDivElement>;
  playerFrameRef: RefObject<HTMLDivElement>;
  isRtmpLive: boolean;
  hasRemoteVideo: boolean;
  statusText: string;
  muted: boolean;
  volume: number;
  paused: boolean;
  needsUserGesture: boolean;
  onToggleMuted: () => void;
  onVolumeChange: (volume: number) => void;
  onTogglePlay: () => void;
  onFullscreen: () => void;
  onPlaybackBlocked: () => void;
  onGoHome?: () => void;
  onOpenPost?: () => void;
  immersive?: boolean;
  showControls?: boolean;
  hideDefaultControls?: boolean;
  onFrameClick?: () => void;
  children?: React.ReactNode;
}

export function LiveVideoPlayer({
  session,
  state,
  replayUrl,
  remoteContainerRef,
  playerFrameRef,
  isRtmpLive,
  hasRemoteVideo,
  statusText,
  muted,
  volume,
  paused,
  needsUserGesture,
  onToggleMuted,
  onVolumeChange,
  onTogglePlay,
  onFullscreen,
  onPlaybackBlocked,
  onGoHome,
  onOpenPost,
  immersive = false,
  showControls = true,
  hideDefaultControls = false,
  onFrameClick,
  children,
}: LiveVideoPlayerProps) {
  const liveHlsUrl = isRtmpLive ? session.hls_url : null;
  const showLiveControls = state === 'live' || state === 'reconnecting';

  return (
    <div className={cn('overflow-hidden bg-black shadow-xl', immersive ? 'rounded-none border-0' : 'rounded-2xl border border-gold/20')}>
      <div
        ref={playerFrameRef}
        className={cn(
          'relative bg-black [&:fullscreen]:h-screen [&:fullscreen]:min-h-0 [&:fullscreen]:w-screen [&:fullscreen]:rounded-none [&:fullscreen]:bg-black [&:fullscreen_video]:!object-contain',
          immersive
            ? 'h-[100dvh] min-h-[100dvh]'
            : 'h-[52dvh] min-h-[320px] md:h-[68vh] lg:h-[min(72vh,760px)]',
        )}
        onClick={onFrameClick}
      >
        {state === 'replay_ready' && replayUrl ? (
          <ReplayPlayer src={replayUrl} className="h-full w-full" controls autoPlay={false} />
        ) : liveHlsUrl && showLiveControls ? (
          <PortraitVideoBackdrop
            src={liveHlsUrl}
            muted={muted || volume <= 0}
            volume={volume}
            paused={paused}
            live
            onPlaybackBlocked={onPlaybackBlocked}
          />
        ) : showLiveControls ? (
          <div
            ref={remoteContainerRef}
            className="absolute inset-0 h-full w-full bg-[radial-gradient(circle_at_center,_rgba(22,163,74,0.16),_rgba(0,0,0,1)_68%)] [&_video]:h-full [&_video]:w-full [&_video]:object-contain"
          />
        ) : null}

        {showLiveControls && !isRtmpLive && (!hasRemoteVideo || paused || state === 'reconnecting') && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 px-4 text-center text-white/90">
            <div className="rounded-2xl bg-black/45 px-5 py-4 shadow-xl backdrop-blur">
              <Wifi className="mx-auto mb-2 h-6 w-6 text-gold" />
              <p className="text-sm font-semibold">
                {paused ? 'Tạm dừng' : state === 'reconnecting' ? 'Mất tín hiệu, đang kết nối lại...' : statusText || 'Đang kết nối live'}
              </p>
            </div>
          </div>
        )}

        {(state === 'ended' || state === 'processing_replay' || state === 'failed') && (
          <LiveEndedReplayState
            state={state}
            hasPost={!!session.post_id}
            onGoHome={onGoHome}
            onOpenPost={onOpenPost}
          />
        )}

        {showLiveControls && showControls && !hideDefaultControls && (
          <LiveViewerControls
            muted={muted}
            volume={volume}
            paused={paused}
            onToggleMuted={onToggleMuted}
            onVolumeChange={onVolumeChange}
            onTogglePlay={onTogglePlay}
            onFullscreen={onFullscreen}
            needsUserGesture={needsUserGesture}
          />
        )}

        {showLiveControls && children}
      </div>
    </div>
  );
}
