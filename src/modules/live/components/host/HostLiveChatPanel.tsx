import { useState } from 'react';
import { Eye, Pin, Send, Sparkles, Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LiveSharePanel } from '../LiveSharePanel';
import type { HostLiveCommonProps } from './hostLiveTypes';
import { LiveActivityPanel } from './LiveActivityPanel';

type HostLiveChatPanelProps = Pick<
  HostLiveCommonProps,
  | 'session'
  | 'sessionId'
  | 'viewers'
  | 'messages'
  | 'messagesLoading'
  | 'reactions'
  | 'onSendMessage'
>;

export function HostLiveChatPanel({
  session,
  sessionId,
  viewers,
  messages,
  messagesLoading,
  reactions,
  onSendMessage,
}: HostLiveChatPanelProps) {
  const [text, setText] = useState('');

  const handleSend = async () => {
    const value = text.trim();
    if (!value) return;
    await onSendMessage(value);
    setText('');
  };

  return (
    <aside className="sticky top-16 flex h-[calc(100vh-80px)] min-h-[600px] flex-col overflow-hidden rounded-[28px] border border-gold/20 bg-white/90 shadow-[0_22px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl">
      <div className="border-b border-gold/15 bg-gradient-to-br from-primary/10 via-white to-gold/10 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black">Live chat</h2>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">Bình luận, tương tác và người xem mới</p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 shadow-sm">
            <Eye className="h-3.5 w-3.5" />
            {viewers.length}
          </div>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {viewers.length === 0 ? (
            <div className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">Đang chờ người xem đầu tiên</div>
          ) : (
            viewers.slice(0, 10).map((viewer) => (
              <div key={viewer.userId} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/85 px-2 py-1 text-xs font-semibold shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                <Avatar className="h-5 w-5">
                  <AvatarImage src={viewer.avatar_url} />
                  <AvatarFallback className="text-[9px]">{viewer.username?.charAt(0)?.toUpperCase() || '?'}</AvatarFallback>
                </Avatar>
                <span className="max-w-[82px] truncate">{viewer.username}</span>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full bg-white/80 text-xs font-bold" disabled title="Pin comment sắp ra mắt">
            <Pin className="h-3.5 w-3.5" />
            Pin
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full bg-white/80 text-xs font-bold" disabled title="Highlight comment sắp ra mắt">
            <Star className="h-3.5 w-3.5" />
            Highlight
          </Button>
          <LiveSharePanel sessionId={sessionId} username={session.host_profile?.username || undefined} />
        </div>
      </div>

      <LiveActivityPanel
        messages={messages}
        reactions={reactions}
        viewers={viewers}
        isLoading={messagesLoading}
        liveStartedAt={session.started_at}
      />

      <div className="border-t border-gold/15 bg-background/90 p-3">
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-primary/5 px-3 py-2 text-xs font-semibold text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-gold" />
          Lời chào của host sẽ giúp live có năng lượng hơn.
        </div>
        <div className="flex items-center gap-2 rounded-full border border-gold/15 bg-white p-1.5 shadow-inner">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSend().catch(() => undefined);
              }
            }}
            placeholder="Viết bình luận với khán giả..."
            className="h-10 rounded-full border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
          />
          <Button size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={() => handleSend().catch(() => undefined)} disabled={!text.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
