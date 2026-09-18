import { useEffect, useRef, useState } from 'react';
import { Eye, Send, Video } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLiveMessages } from '../hooks/useLiveMessages';
import { type LiveViewer } from '../hooks/useLivePresence';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LiveChatPanelProps {
  sessionId: string;
  className?: string;
  isHost?: boolean;
  liveTitle?: string;
  /** Pass viewers from parent to avoid duplicate Presence subscription */
  viewers?: LiveViewer[];
}

export function LiveChatPanel({ sessionId, className, isHost = false, liveTitle, viewers = [] }: LiveChatPanelProps) {
  const { messages, sendMessage, isLoading } = useLiveMessages(sessionId);
  const [text, setText] = useState('');
  const { userId: currentUserId, isAuthenticated } = useCurrentUser();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const value = text.trim();
    if (!value) return;
    try {
      await sendMessage(value);
      setText('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('quá nhanh')) {
        toast.error(msg);
      }
    }
  };

  const handleInvite = async (viewer: LiveViewer) => {
    if (!currentUserId) return;
    const { error } = await supabase.from('notifications').insert({
      type: 'live_invite',
      user_id: viewer.userId,
      actor_id: currentUserId,
      metadata: { session_id: sessionId, live_title: liveTitle || 'Live Stream' },
    });
    if (error) {
      toast.error('Không thể gửi lời mời');
    } else {
      toast.success(`Đã gửi lời mời đến ${viewer.username}`);
    }
  };

  return (
    <div className={className}>
      <div className="border rounded-xl bg-card h-full flex flex-col">
        {/* Viewer presence bar */}
        {viewers.length > 0 && (
          <div className="px-3 py-2 border-b space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              <span>{viewers.length} người đang xem</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {viewers.map((v) => {
                const chip = (
                  <div className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full bg-muted text-xs cursor-default hover:bg-accent transition-colors">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={v.avatar_url} />
                      <AvatarFallback className="text-[8px]">{v.username?.charAt(0)?.toUpperCase() || '?'}</AvatarFallback>
                    </Avatar>
                    <span className="truncate max-w-[80px]">{v.username}</span>
                  </div>
                );

                if (isHost && v.userId !== currentUserId) {
                  return (
                    <Popover key={v.userId}>
                      <PopoverTrigger asChild>{chip}</PopoverTrigger>
                      <PopoverContent className="w-auto p-1" side="bottom" align="start">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => handleInvite(v)}
                        >
                          <Video className="h-3.5 w-3.5" />
                          Mời live cùng
                        </Button>
                      </PopoverContent>
                    </Popover>
                  );
                }

                return <div key={v.userId}>{chip}</div>;
              })}
            </div>
          </div>
        )}

        <div className="px-3 py-2 border-b font-semibold text-sm">Live Chat</div>

        <ScrollArea className="flex-1 px-3">
          <div className="space-y-3 py-3">
            {isLoading && <div className="text-xs text-muted-foreground">Loading chat...</div>}
            {!isLoading &&
              messages.map((msg) => (
                <div key={msg.id} className="flex gap-2">
                  <Avatar className="h-7 w-7 mt-0.5">
                    <AvatarImage src={msg.profile?.avatar_url || ''} />
                    <AvatarFallback className="text-xs">
                      {msg.profile?.username?.charAt(0)?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{msg.profile?.username || 'User'}</div>
                    <div className="text-sm break-words">{msg.content}</div>
                  </div>
                </div>
              ))}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        {isAuthenticated ? (
          <div className="p-2 border-t flex items-center gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Viết bình luận..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
            />
            <Button size="icon" variant="ghost" onClick={handleSend}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="p-3 border-t text-center text-xs text-muted-foreground">
            <span>Đăng nhập để bình luận</span>
          </div>
        )}
      </div>
    </div>
  );
}
