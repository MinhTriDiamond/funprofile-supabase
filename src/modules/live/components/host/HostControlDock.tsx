import { Heart, Loader2, Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiveSharePanel } from '../LiveSharePanel';
import type { HostLiveCommonProps } from './hostLiveTypes';

const HOST_REACTION_EMOJIS = ['❤️', '👍', '🔥', '🎉'];

type HostControlDockProps = Pick<
  HostLiveCommonProps,
  | 'session'
  | 'sessionId'
  | 'isJoined'
  | 'isMuted'
  | 'isCameraOff'
  | 'isSwitchingCamera'
  | 'isEnding'
  | 'onToggleMute'
  | 'onToggleCamera'
  | 'onSwitchCamera'
  | 'onRequestEnd'
  | 'onReact'
>;

export function HostControlDock({
  session,
  sessionId,
  isJoined,
  isMuted,
  isCameraOff,
  isSwitchingCamera,
  isEnding,
  onToggleMute,
  onToggleCamera,
  onSwitchCamera,
  onRequestEnd,
  onReact,
}: HostControlDockProps) {
  const disabled = !isJoined || isEnding;

  return (
    <div className="grid gap-2 [&>button]:w-full [&>button]:justify-start">
      <Button variant={isMuted ? 'default' : 'outline'} className="h-11 rounded-full gap-2 px-4 font-bold" onClick={onToggleMute} disabled={disabled}>
        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {isMuted ? 'Bật mic' : 'Tắt mic'}
      </Button>
      <Button variant={isCameraOff ? 'default' : 'outline'} className="h-11 rounded-full gap-2 px-4 font-bold" onClick={onToggleCamera} disabled={disabled}>
        {isCameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
        {isCameraOff ? 'Bật camera' : 'Tắt camera'}
      </Button>
      <Button
        variant="outline"
        className="h-11 rounded-full gap-2 px-4 font-bold"
        onClick={() => onSwitchCamera()}
        disabled={disabled || isCameraOff || isSwitchingCamera}
      >
        {isSwitchingCamera ? <Loader2 className="h-4 w-4 animate-spin" /> : <SwitchCamera className="h-4 w-4" />}
        Đổi camera
      </Button>
      <LiveSharePanel sessionId={sessionId} username={session.host_profile?.username || undefined} />
      <Button
        variant="outline"
        className="h-11 rounded-full gap-2 px-4 font-bold text-reaction-love hover:bg-muted"
        onClick={() => onReact(HOST_REACTION_EMOJIS[0])}
        disabled={isEnding}
      >
        <Heart className="h-4 w-4 fill-current" />
        Thả tim
      </Button>
      <Button
        variant="destructive"
        className="h-12 rounded-full gap-2 px-6 font-black uppercase shadow-sm"
        onClick={onRequestEnd}
        disabled={isEnding}
      >
        {isEnding ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
        {isEnding ? 'Đang kết thúc' : 'Kết thúc LIVE'}
      </Button>
    </div>
  );
}
