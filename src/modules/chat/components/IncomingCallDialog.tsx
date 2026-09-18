
import { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Phone, Video, PhoneOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import logger from '@/lib/logger';
import type { CallSession } from '../types';

interface IncomingCallDialogProps {
  callSession: CallSession | null;
  onAnswer: () => void;
  onDecline: () => void;
}

export function IncomingCallDialog({ callSession, onAnswer, onDecline }: IncomingCallDialogProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  const callerInfo = {
    username: 'Người dùng', // In real app, fetch from profile
    full_name: 'Người dùng',
    avatar_url: null,
  };

  // Play ringtone
  useEffect(() => {
    if (!callSession) {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current.currentTime = 0;
        ringtoneRef.current = null;
      }
      return;
    }

    // Create and play ringtone
    const ringtone = new Audio('/sounds/ringtone.mp3');
    ringtone.loop = true;
    ringtone.volume = 0.7;
    ringtoneRef.current = ringtone;
    
    // Try to play (may fail if no user interaction yet)
    ringtone.play().catch(err => {
      logger.debug('[Ringtone] Autoplay blocked:', err.message);
    });

    return () => {
      ringtone.pause();
      ringtone.currentTime = 0;
      ringtoneRef.current = null;
    };
  }, [callSession]);

  // Vibrate on mobile
  useEffect(() => {
    if (!callSession) return;

    if (navigator.vibrate) {
      const pattern = [200, 100, 200, 100, 200];
      navigator.vibrate(pattern);
      
      const interval = setInterval(() => {
        navigator.vibrate(pattern);
      }, 2000);

      return () => {
        clearInterval(interval);
        navigator.vibrate(0);
      };
    }
  }, [callSession]);

  if (!callSession) return null;

  const isVideoCall = callSession.call_type === 'video';

  return (
    <Dialog open={!!callSession} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md bg-gradient-to-b from-background to-muted border-none [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby="incoming-call-description"
      >
        <VisuallyHidden>
          <DialogTitle>Cuộc gọi đến</DialogTitle>
          <DialogDescription id="incoming-call-description">
            {callerInfo?.full_name || callerInfo?.username || 'Người dùng'} đang gọi cho bạn
          </DialogDescription>
        </VisuallyHidden>
        <div className="flex flex-col items-center py-8 space-y-6">
          {/* Animated ring effect */}
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/30 h-28 w-28" />
            <div className="absolute inset-2 animate-ping animation-delay-150 rounded-full bg-primary/20 h-24 w-24" />
            <Avatar className="h-24 w-24 relative z-10 ring-4 ring-background">
              <AvatarImage src={callerInfo?.avatar_url || undefined} alt={callerInfo?.full_name || callerInfo?.username} />
              <AvatarFallback className="text-3xl bg-primary text-primary-foreground">
                {(callerInfo?.full_name || callerInfo?.username || 'U')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Caller info */}
          <div className="text-center space-y-2">
            <h3 className="text-xl font-semibold">
              {callerInfo?.full_name || callerInfo?.username || 'Người dùng'}
            </h3>
            <p className="text-muted-foreground flex items-center justify-center gap-2">
              {isVideoCall ? (
                <>
                  <Video className="h-4 w-4" />
                  Cuộc gọi video đến...
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4" />
                  Cuộc gọi thoại đến...
                </>
              )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-8 pt-4">
            {/* Decline button */}
            <div className="flex flex-col items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onDecline();
                }}
                className="h-16 w-16 rounded-full shadow-lg hover:scale-105 transition-transform"
              >
                <PhoneOff className="h-7 w-7" />
              </Button>
              <span className="text-sm text-muted-foreground">Từ chối</span>
            </div>

            {/* Answer button */}
            <div className="flex flex-col items-center gap-2">
              <Button
                type="button"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onAnswer();
                }}
                className={cn(
                  'h-16 w-16 rounded-full shadow-lg hover:scale-105 transition-transform',
                  'bg-green-500 hover:bg-green-600'
                )}
              >
                {isVideoCall ? (
                  <Video className="h-7 w-7" />
                ) : (
                  <Phone className="h-7 w-7" />
                )}
              </Button>
              <span className="text-sm text-muted-foreground">Trả lời</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
