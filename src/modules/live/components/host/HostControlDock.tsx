import { BarChart3, Heart, Loader2, Mic, MicOff, PhoneOff, Share2, SwitchCamera, Video, VideoOff } from 'lucide-react';
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
    <div className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-[28px] border border-gold/20 bg-white/92 p-2.5 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur-xl">
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
        className="h-11 rounded-full gap-2 px-4 font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        onClick={() => onReact(HOST_REACTION_EMOJIS[0])}
        disabled={isEnding}
      >
        <Heart className="h-4 w-4 fill-current" />
        Thả tim
      </Button>
      <Button variant="outline" className="h-11 rounded-full gap-2 px-4 font-bold" disabled title="Analytics chi tiết sắp ra mắt">
        <BarChart3 className="h-4 w-4" />
        Analytics
      </Button>
      <Button variant="outline" className="h-11 rounded-full gap-2 px-4 font-bold" disabled title="Feed post control sắp ra mắt">
        <Share2 className="h-4 w-4" />
        Feed post
      </Button>
      <Button
        variant="destructive"
        className="h-12 rounded-full gap-2 px-6 font-black uppercase shadow-[0_12px_28px_rgba(220,38,38,0.35)] transition-transform hover:scale-[1.02]"
        onClick={onRequestEnd}
        disabled={isEnding}
      >
        {isEnding ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
        {isEnding ? 'Đang kết thúc' : 'Kết thúc LIVE'}
      </Button>
    </div>
  );
}
