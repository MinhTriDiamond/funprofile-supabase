
import { useState, useEffect, useRef, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ICameraVideoTrack, ILocalVideoTrack } from 'agora-rtc-sdk-ng';
import { cn } from '@/lib/utils';
import { MicOff, VideoOff } from 'lucide-react';
import type { RemoteUser } from '../types';

interface VideoGridProps {
  localVideoTrack: ICameraVideoTrack | null;
  screenTrack?: ILocalVideoTrack | null;
  remoteUsers: RemoteUser[];
  isLocalCameraOff: boolean;
  isLocalMuted?: boolean;
  localUserInfo?: {
    username?: string;
    avatarUrl?: string;
  };
  remoteUserInfo?: {
    username?: string;
    avatarUrl?: string;
  };
}

function VideoPlayer({ videoTrack, className }: { videoTrack: any; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && videoTrack) {
      videoTrack.play(containerRef.current);
    }
    return () => {
      videoTrack?.stop();
    };
  }, [videoTrack]);

  return <div ref={containerRef} className={cn('w-full h-full', className)} />;
}

// PiP dimensions
const PIP_W = 128;
const PIP_H = 180;

export function VideoGrid({
  localVideoTrack,
  screenTrack,
  remoteUsers,
  isLocalCameraOff,
  isLocalMuted = false,
  localUserInfo,
  remoteUserInfo,
}: VideoGridProps) {
  const [isSwapped, setIsSwapped] = useState(false);
  // null = default position (bottom-right corner)
  const [pipPosition, setPipPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    dragging: false,
    startPointerX: 0,
    startPointerY: 0,
    startElemX: 0,
    startElemY: 0,
    moved: false,
  });

  const totalParticipants = remoteUsers.length + 1;

  const getGridClass = () => {
    if (totalParticipants === 1) return 'grid-cols-1';
    if (totalParticipants === 2) return 'grid-cols-1 md:grid-cols-2';
    if (totalParticipants <= 4) return 'grid-cols-2';
    if (totalParticipants <= 6) return 'grid-cols-2 md:grid-cols-3';
    return 'grid-cols-3 md:grid-cols-4';
  };

  const isOneOnOne = remoteUsers.length === 1;

  const handleSwap = useCallback(() => {
    setIsSwapped(prev => !prev);
    setPipPosition(null); // reset to corner on swap
  }, []);

  const getDefaultPipPosition = useCallback(() => {
    if (!containerRef.current) return { x: 16, y: 16 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: rect.width - PIP_W - 16,
      y: rect.height - PIP_H - 16,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const currentPos = pipPosition ?? getDefaultPipPosition();

    dragState.current = {
      dragging: true,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startElemX: currentPos.x,
      startElemY: currentPos.y,
      moved: false,
    };
    setIsDragging(true);
  }, [pipPosition, getDefaultPipPosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;

    const dx = e.clientX - dragState.current.startPointerX;
    const dy = e.clientY - dragState.current.startPointerY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      dragState.current.moved = true;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const maxX = rect.width - PIP_W;
    const maxY = rect.height - PIP_H;

    const newX = Math.max(0, Math.min(maxX, dragState.current.startElemX + dx));
    const newY = Math.max(0, Math.min(maxY, dragState.current.startElemY + dy));

    setPipPosition({ x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragState.current.moved) {
      handleSwap();
    }
    dragState.current.dragging = false;
    setIsDragging(false);
  }, [handleSwap]);

  if (isOneOnOne) {
    const remoteUser = remoteUsers[0];
    const hasScreenShare = !!screenTrack;

    // When screen sharing, screen is always main, camera goes to PiP
    const mainVideoTrack = hasScreenShare
      ? screenTrack
      : isSwapped ? localVideoTrack : (remoteUser.hasVideo ? remoteUser.videoTrack : null);
    const mainCameraOff = hasScreenShare
      ? false
      : isSwapped ? isLocalCameraOff : !remoteUser.hasVideo;
    const mainUserInfo = hasScreenShare ? localUserInfo : (isSwapped ? localUserInfo : remoteUserInfo);
    const mainLabel = hasScreenShare ? 'Màn hình của bạn' : (isSwapped ? 'Bạn' : (remoteUserInfo?.username || 'User'));
    const mainMuted = hasScreenShare ? false : (isSwapped ? isLocalMuted : !remoteUser.hasAudio);

    const pipVideoTrack = hasScreenShare
      ? (remoteUser.hasVideo ? remoteUser.videoTrack : null)
      : isSwapped ? (remoteUser.hasVideo ? remoteUser.videoTrack : null) : localVideoTrack;
    const pipCameraOff = hasScreenShare
      ? !remoteUser.hasVideo
      : isSwapped ? !remoteUser.hasVideo : isLocalCameraOff;
    const pipUserInfo = hasScreenShare ? remoteUserInfo : (isSwapped ? remoteUserInfo : localUserInfo);
    const pipLabel = hasScreenShare ? (remoteUserInfo?.username || 'User') : (isSwapped ? (remoteUserInfo?.username || 'User') : 'Bạn');
    const pipMuted = hasScreenShare ? !remoteUser.hasAudio : (isSwapped ? !remoteUser.hasAudio : isLocalMuted);

    const pos = pipPosition ?? getDefaultPipPosition();

    return (
      <div ref={containerRef} className="relative w-full h-full bg-muted overflow-hidden">
        {/* Main video - full screen */}
        {!mainCameraOff && mainVideoTrack ? (
          <VideoPlayer videoTrack={mainVideoTrack} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Avatar className="h-32 w-32">
              <AvatarImage src={mainUserInfo?.avatarUrl} />
              <AvatarFallback className="text-4xl">
                {(mainUserInfo?.username || 'U')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        )}

        {/* Main user indicators */}
        <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
          <span className="text-sm text-primary-foreground bg-background/50 px-2 py-1 rounded backdrop-blur-sm">
            {mainLabel}
          </span>
          {mainMuted && (
            <div className="bg-destructive/80 p-1 rounded-full">
              <MicOff className="h-4 w-4 text-destructive-foreground" />
            </div>
          )}
        </div>

        {/* PiP video - draggable */}
        <div
          ref={pipRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            position: 'absolute',
            left: pos.x,
            top: pos.y,
            width: PIP_W,
            height: PIP_H,
            touchAction: 'none',
          }}
          className={cn(
            'rounded-xl overflow-hidden shadow-lg border-2 border-white/30 group transition-shadow',
            isDragging
              ? 'cursor-grabbing shadow-2xl opacity-90 scale-105'
              : 'cursor-grab hover:border-primary/60 hover:shadow-xl'
          )}
        >
          {!pipCameraOff && pipVideoTrack ? (
            <VideoPlayer videoTrack={pipVideoTrack} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Avatar className="h-12 w-12">
                <AvatarImage src={pipUserInfo?.avatarUrl} />
                <AvatarFallback>
                  {(pipUserInfo?.username || 'Me')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          )}

          {/* PiP overlay info */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <span className="text-xs text-primary-foreground bg-background/50 px-1 py-0.5 rounded">
              {pipLabel}
            </span>
            <div className="flex items-center gap-1">
              {pipCameraOff && (
                <div className="bg-destructive/80 p-0.5 rounded-full">
                  <VideoOff className="h-3 w-3 text-destructive-foreground" />
                </div>
              )}
              {pipMuted && (
                <div className="bg-destructive/80 p-0.5 rounded-full">
                  <MicOff className="h-3 w-3 text-destructive-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* Hint overlay */}
          <div className={cn(
            'absolute inset-0 bg-background/40 flex items-center justify-center transition-opacity',
            isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}>
            <span className="text-xs text-foreground font-medium text-center px-2">
              {isDragging ? 'Đang di chuyển…' : 'Giữ để di chuyển · Click để swap'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Grid layout for group calls or when no remote users
  return (
    <div className={cn('w-full h-full grid gap-2 p-2', getGridClass())}>
      {/* Local user */}
      <div className="relative rounded-lg overflow-hidden bg-muted aspect-video">
        {!isLocalCameraOff && localVideoTrack ? (
          <VideoPlayer videoTrack={localVideoTrack} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Avatar className="h-20 w-20">
              <AvatarImage src={localUserInfo?.avatarUrl} />
              <AvatarFallback className="text-2xl">
                {(localUserInfo?.username || 'Me')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          <span className="text-xs text-primary-foreground bg-background/50 px-2 py-1 rounded">
            Bạn
          </span>
          {isLocalMuted && (
            <div className="bg-destructive/80 p-0.5 rounded-full">
              <MicOff className="h-3 w-3 text-destructive-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Remote users */}
      {remoteUsers.map((user) => (
        <div key={String(user.uid)} className="relative rounded-lg overflow-hidden bg-muted aspect-video">
          {user.hasVideo && user.videoTrack ? (
            <VideoPlayer videoTrack={user.videoTrack} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-2xl">U</AvatarFallback>
              </Avatar>
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <span className="text-xs text-primary-foreground bg-background/50 px-2 py-1 rounded">
              User {user.uid}
            </span>
            {!user.hasAudio && (
              <div className="bg-destructive/80 p-0.5 rounded-full">
                <MicOff className="h-3 w-3 text-destructive-foreground" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
