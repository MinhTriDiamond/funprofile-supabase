import { useEffect, useMemo, useRef } from 'react';
import { Eye, Gift, Heart, MessageCircle, Share2, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { LiveMessage } from '../../hooks/useLiveMessages';
import type { LiveReaction } from '../../hooks/useLiveReactions';
import type { LiveViewer } from '../../hooks/useLivePresence';

type ActivityItem = {
  id: string;
  type: 'comment' | 'reaction' | 'join' | 'share' | 'gift' | 'system';
  name: string;
  text: string;
  avatar?: string | null;
  emoji?: string;
  createdAt: string;
};

function ActivityIcon({ type }: { type: ActivityItem['type'] }) {
  if (type === 'comment') return <MessageCircle className="h-3.5 w-3.5 text-primary" />;
  if (type === 'reaction') return <Heart className="h-3.5 w-3.5 text-rose-500" />;
  if (type === 'join') return <Eye className="h-3.5 w-3.5 text-emerald-600" />;
  if (type === 'share') return <Share2 className="h-3.5 w-3.5 text-blue-500" />;
  if (type === 'gift') return <Gift className="h-3.5 w-3.5 text-gold" />;
  return <Sparkles className="h-3.5 w-3.5 text-gold" />;
}

interface LiveActivityPanelProps {
  messages: LiveMessage[];
  reactions: LiveReaction[];
  viewers: LiveViewer[];
  isLoading: boolean;
  liveStartedAt?: string | null;
}

function isAtOrAfter(value: string, minValue?: string | null) {
  if (!minValue) return true;
  const valueTime = new Date(value).getTime();
  const minTime = new Date(minValue).getTime();
  if (!Number.isFinite(valueTime) || !Number.isFinite(minTime)) return true;
  return valueTime >= minTime;
}

export function LiveActivityPanel({ messages, reactions, viewers, isLoading, liveStartedAt }: LiveActivityPanelProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  const activity = useMemo(() => {
    const comments = messages
      .filter((message) => isAtOrAfter(message.created_at, liveStartedAt))
      .map((message) => ({
        id: `comment-${message.id}`,
        type: 'comment' as const,
        name: message.profile?.username || 'Viewer',
        text: message.content,
        avatar: message.profile?.avatar_url,
        createdAt: message.created_at,
      }));

    const reactionItems = reactions
      .filter((reaction) => isAtOrAfter(reaction.created_at, liveStartedAt))
      .slice(-36)
      .map((reaction) => ({
        id: `reaction-${reaction.id}`,
        type: 'reaction' as const,
        name: 'Viewer',
        text: 'vua tuong tac',
        emoji: reaction.emoji,
        createdAt: reaction.created_at,
      }));

    const joins = viewers.slice(-8).map((viewer) => ({
      id: `join-${viewer.userId}`,
      type: 'join' as const,
      name: viewer.username || 'Viewer',
      text: 'dang xem truc tiep',
      avatar: viewer.avatar_url,
      createdAt: new Date().toISOString(),
    }));

    return [...comments, ...reactionItems, ...joins]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-140);
  }, [messages, reactions, viewers, liveStartedAt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activity.length]);

  const showEmptyState = !isLoading && activity.length === 0;

  return (
    <ScrollArea className="flex-1 px-3">
      <div className="space-y-3 py-3">
        {isLoading && <div className="rounded-2xl bg-muted/35 px-3 py-3 text-xs font-semibold text-muted-foreground">Đang tải live chat...</div>}
        {showEmptyState && (
          <div className="rounded-3xl border border-dashed border-gold/25 bg-gradient-to-br from-primary/5 to-gold/10 px-4 py-5 text-sm text-muted-foreground">
            <div className="mb-1 text-base font-black text-foreground">Chưa có bình luận nào 👋</div>
            <div>Hãy chào mọi người để bắt đầu cuộc trò chuyện.</div>
          </div>
        )}
        {activity.map((item) => (
          <div key={item.id} className="flex animate-in fade-in-0 slide-in-from-bottom-1 gap-2 duration-200">
            <div className="relative shrink-0">
              <Avatar className="h-8 w-8">
                <AvatarImage src={('avatar' in item ? item.avatar : '') || ''} />
                <AvatarFallback className="bg-muted text-xs">{item.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-card bg-background">
                {('emoji' in item && item.emoji) ? <span className="text-xs">{item.emoji}</span> : <ActivityIcon type={item.type} />}
              </span>
            </div>
            <div className={item.type === 'comment' ? 'min-w-0 rounded-2xl bg-primary/10 px-3 py-2' : 'min-w-0 rounded-2xl bg-muted/55 px-3 py-2'}>
              <div className="text-xs font-bold">{item.name}</div>
              <div className="break-words text-sm leading-snug text-foreground/90">{item.text}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
