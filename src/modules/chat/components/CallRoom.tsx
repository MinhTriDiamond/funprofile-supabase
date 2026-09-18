
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CallControls } from './CallControls';
import { VideoGrid } from './VideoGrid';
import { ICameraVideoTrack, ILocalVideoTrack } from 'agora-rtc-sdk-ng';
import { Phone, Video, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CallState, CallType, RemoteUser } from '../types';

interface CallRoomProps {
  isOpen: boolean;
  callState: CallState;
  callType: CallType;
  callDuration: number;
  localVideoTrack: ICameraVideoTrack | null;
  screenTrack?: ILocalVideoTrack | null;
  remoteUsers: RemoteUser[];
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing?: boolean;
  hasMultipleCameras?: boolean;
  localUserInfo?: {
    username?: string;
    avatarUrl?: string;
  };
  remoteUserInfo?: {
    username?: string;
    avatarUrl?: string;
  };
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare?: () => void;
  onSwitchToVideo?: () => void;
  onFlipCamera?: () => void;
  onOpenSettings?: () => void;
  onEndCall: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function CallRoom({
  isOpen,
  callState,
  callType,
  callDuration,
  localVideoTrack,
  screenTrack,
  remoteUsers,
  isMuted,
  isCameraOff,
  isScreenSharing = false,
  hasMultipleCameras = false,
  localUserInfo,
  remoteUserInfo,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onSwitchToVideo,
  onFlipCamera,
  onOpenSettings,
  onEndCall,
}: CallRoomProps) {
  const isConnected = callState === 'connected';
  const isConnecting = callState === 'connecting' || callState === 'calling' || callState === 'ringing';
  const isVideoCall = callType === 'video';

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-none w-screen h-screen p-0 border-none bg-background [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="relative w-full h-full flex flex-col">
          {/* Top bar with call info */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-background/70 to-transparent">
            <div className="flex items-center gap-3">
              <div className={cn(
                'px-3 py-1 rounded-full text-sm font-medium',
                isConnected ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground'
              )}>
                {isConnected ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    {formatDuration(callDuration)}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {callState === 'ringing' ? 'Đang đổ chuông...' : 'Đang kết nối...'}
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-foreground">
              {isVideoCall ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              <span className="text-sm">{isVideoCall ? 'Video Call' : 'Voice Call'}</span>
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1 relative">
            {isVideoCall && isConnected ? (
              <VideoGrid
                localVideoTrack={localVideoTrack}
                screenTrack={screenTrack}
                remoteUsers={remoteUsers}
                isLocalCameraOff={isCameraOff}
                isLocalMuted={isMuted}
                localUserInfo={localUserInfo}
                remoteUserInfo={remoteUserInfo}
              />
            ) : (
              // Voice call or connecting state - show avatars
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-muted to-background">
                {/* Remote user avatar */}
                <div className="relative">
                  {isConnecting && (
                    <div className="absolute inset-0 animate-ping rounded-full bg-primary/30" style={{ width: '160px', height: '160px', margin: '-8px' }} />
                  )}
                  <Avatar className="h-36 w-36 ring-4 ring-background shadow-2xl">
                    <AvatarImage src={remoteUserInfo?.avatarUrl} />
                    <AvatarFallback className="text-5xl bg-primary text-primary-foreground">
                      {(remoteUserInfo?.username || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <h2 className="mt-6 text-2xl font-semibold text-foreground">
                  {remoteUserInfo?.username || 'Người dùng'}
                </h2>

                <p className="mt-2 text-muted-foreground">
                  {isConnected ? (
                    formatDuration(callDuration)
                  ) : callState === 'ringing' ? (
                    'Đang đổ chuông...'
                  ) : (
                    'Đang kết nối...'
                  )}
                </p>

                {/* Show local user small avatar */}
                <div className="absolute bottom-32 right-6">
                  <Avatar className="h-20 w-20 ring-2 ring-background shadow-lg">
                    <AvatarImage src={localUserInfo?.avatarUrl} />
                    <AvatarFallback className="text-xl">
                      {(localUserInfo?.username || 'Me')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-xs bg-background/50 text-foreground px-2 py-0.5 rounded">
                    Bạn
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <CallControls
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              isVideoCall={isVideoCall}
              isScreenSharing={isScreenSharing}
              hasMultipleCameras={hasMultipleCameras}
              onToggleMute={onToggleMute}
              onToggleCamera={onToggleCamera}
              onToggleScreenShare={onToggleScreenShare}
              onSwitchToVideo={!isVideoCall ? onSwitchToVideo : undefined}
              onFlipCamera={onFlipCamera}
              onOpenSettings={onOpenSettings}
              onEndCall={onEndCall}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
