
import { Button } from '@/components/ui/button';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff,
  Camera,
  SwitchCamera,
  Settings,
  Monitor,
  MonitorOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface CallControlsProps {
  isMuted: boolean;
  isCameraOff: boolean;
  isVideoCall: boolean;
  isScreenSharing?: boolean;
  hasMultipleCameras?: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare?: () => void;
  onSwitchToVideo?: () => void;
  onFlipCamera?: () => void;
  onOpenSettings?: () => void;
  onEndCall: () => void;
}

export function CallControls({
  isMuted,
  isCameraOff,
  isVideoCall,
  isScreenSharing = false,
  hasMultipleCameras = false,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onSwitchToVideo,
  onFlipCamera,
  onOpenSettings,
  onEndCall,
}: CallControlsProps) {
  const isMobile = useIsMobile();

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4 p-3 sm:p-4 bg-background/80 backdrop-blur-sm rounded-full">
      {/* Mute button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleMute}
        className={cn(
          'h-11 w-11 sm:h-12 sm:w-12 rounded-full',
          isMuted && 'bg-destructive/20 text-destructive hover:bg-destructive/30'
        )}
      >
        {isMuted ? <MicOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Mic className="h-5 w-5 sm:h-6 sm:w-6" />}
      </Button>

      {/* Camera toggle (for video calls) */}
      {isVideoCall && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCamera}
          className={cn(
            'h-11 w-11 sm:h-12 sm:w-12 rounded-full',
            isCameraOff && 'bg-destructive/20 text-destructive hover:bg-destructive/30'
          )}
        >
          {isCameraOff ? <VideoOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Video className="h-5 w-5 sm:h-6 sm:w-6" />}
        </Button>
      )}

      {/* Screen share button (only on desktop for video calls) */}
      {isVideoCall && !isMobile && onToggleScreenShare && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleScreenShare}
          className={cn(
            'h-11 w-11 sm:h-12 sm:w-12 rounded-full',
            isScreenSharing && 'bg-primary/20 text-primary hover:bg-primary/30'
          )}
        >
          {isScreenSharing ? <MonitorOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Monitor className="h-5 w-5 sm:h-6 sm:w-6" />}
        </Button>
      )}

      {/* Flip camera button (only on mobile with multiple cameras) */}
      {isVideoCall && !isCameraOff && hasMultipleCameras && isMobile && onFlipCamera && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onFlipCamera}
          className="h-11 w-11 sm:h-12 sm:w-12 rounded-full"
        >
          <SwitchCamera className="h-5 w-5 sm:h-6 sm:w-6" />
        </Button>
      )}

      {/* Settings button (on desktop or when multiple cameras available) */}
      {onOpenSettings && (!isMobile || (hasMultipleCameras && !isMobile)) && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          className="h-11 w-11 sm:h-12 sm:w-12 rounded-full"
        >
          <Settings className="h-5 w-5 sm:h-6 sm:w-6" />
        </Button>
      )}

      {/* Switch to video (for voice calls) */}
      {!isVideoCall && onSwitchToVideo && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onSwitchToVideo}
          className="h-11 w-11 sm:h-12 sm:w-12 rounded-full"
        >
          <Camera className="h-5 w-5 sm:h-6 sm:w-6" />
        </Button>
      )}

      {/* End call button */}
      <Button
        variant="destructive"
        size="icon"
        onClick={onEndCall}
        className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
      >
        <PhoneOff className="h-5 w-5 sm:h-6 sm:w-6" />
      </Button>
    </div>
  );
}
