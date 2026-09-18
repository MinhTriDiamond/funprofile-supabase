import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: number;
  user_id: string;
  content: string;
  created_at: string;
  profile?: { username: string | null; avatar_url: string | null };
}

interface LiveChatReplayProps {
  sessionId: string;
}

export function LiveChatReplay({ sessionId }: LiveChatReplayProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('live_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(500);

      if (!active) return;
      if (error || !data || data.length === 0) {
        setIsLoading(false);
        setMessages([]);
        return;
      }

      const ids = [...new Set(data.map((r: any) => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', ids);

      if (!active) return;
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      setMessages(
        data.map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          content: row.content,
          created_at: row.created_at,
          profile: profileMap.get(row.user_id),
        }))
      );
      setIsLoading(false);
    };

    load().catch(() => setIsLoading(false));
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!isLoading) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isLoading, messages]);

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 shrink-0">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Live Chat Replay
        </span>
        {messages.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{messages.length} tin nhắn</span>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2.5 p-3">
          {isLoading && (
            <div className="text-xs text-muted-foreground text-center py-4">Đang tải...</div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8 flex flex-col items-center gap-2">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <span>Không có tin nhắn trong buổi live này</span>
            </div>
          )}

          {!isLoading &&
            messages.map((msg) => (
              <div key={msg.id} className="flex gap-2">
                <Avatar className="h-6 w-6 mt-0.5 shrink-0">
                  <AvatarImage src={msg.profile?.avatar_url || ''} />
                  <AvatarFallback className="text-[10px]">
                    {msg.profile?.username?.charAt(0)?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold text-foreground">
                    {msg.profile?.username || 'User'}
                  </span>
                  <span className="text-xs text-foreground/80 ml-1.5 break-words">{msg.content}</span>
                </div>
              </div>
            ))}

          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="px-3 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground text-center">
          Chat đã kết thúc – chỉ xem lại
        </p>
      </div>
    </div>
  );
}
