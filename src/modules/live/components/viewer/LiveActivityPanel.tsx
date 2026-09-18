import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Gift, Heart, MessageCircle, Share2, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { LiveViewer } from '../../hooks/useLivePresence';
import type { LiveMessage } from '../../hooks/useLiveMessages';
import type { LiveReaction } from '../../hooks/useLiveReactions';
import { LiveChatComposer } from './LiveChatComposer';

interface LiveActivityPanelProps {
  viewers: LiveViewer[];
  messages: LiveMessage[];
  reactions: LiveReaction[];
  isLoading: boolean;
  onSendMessage: (message: string) => Promise<void>;
  onReact: (emoji: string) => Promise<boolean>;
  onShare?: () => void;
  onGift?: () => void;
  hostUserId?: string | null;
  isLiveActive?: boolean;
  dark?: boolean;
  compact?: boolean;
  className?: string;
}

type ActivityItem = {
  id: string;
  type: 'comment' | 'reaction' | 'join' | 'share' | 'gift' | 'system';
  userId?: string | null;
  name: string;
  text: string;
  avatar?: string | null;
  createdAt: string;
  emoji?: string;
};

function ActivityIcon({ type }: { type: ActivityItem['type'] }) {
  if (type === 'comment') return <MessageCircle className="h-3.5 w-3.5 text-emerald-300" />;
  if (type === 'reaction') return <Heart className="h-3.5 w-3.5 text-rose-400" />;
  if (type === 'join') return <Eye className="h-3.5 w-3.5 text-sky-300" />;
  if (type === 'share') return <Share2 className="h-3.5 w-3.5 text-blue-300" />;
  if (type === 'gift') return <Gift className="h-3.5 w-3.5 text-amber-300" />;
  return <Sparkles className="h-3.5 w-3.5 text-amber-300" />;
}

function CommentText({ text, dark }: { text: string; dark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 96;

  return (
    <div className="text-sm leading-snug">
      <p className={cn('break-words', !expanded && 'line-clamp-2', dark ? 'text-white/92' : 'text-foreground/90')}>
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          className={cn('mt-0.5 text-xs font-semibold', dark ? 'text-emerald-200' : 'text-primary')}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Thu gọn' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}

export function LiveActivityPanel({
  viewers,
  messages,
  reactions,
  isLoading,
  onSendMessage,
  onReact,
  onShare,
  onGift,
  hostUserId,
  isLiveActive = true,
  dark = false,
  compact = false,
  className,
}: LiveActivityPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const { isAuthenticated } = useCurrentUser();

  const activity = useMemo<ActivityItem[]>(() => {
    const commentItems = messages.map((message) => ({
      id: `comment-${message.id}`,
      type: 'comment' as const,
      userId: message.user_id,
      name: message.profile?.username || 'FUN Member',
      text: message.content,
      avatar: message.profile?.avatar_url,
      createdAt: message.created_at,
    }));

    const reactionItems = reactions.slice(-24).map((reaction) => ({
      id: `reaction-${reaction.id}`,
      type: 'reaction' as const,
      userId: reaction.user_id,
      name: 'Viewer',
      text: 'vừa gửi tương tác',
      emoji: reaction.emoji,
      createdAt: reaction.created_at,
    }));

    const joinItems = isLiveActive
      ? viewers.slice(-8).map((viewer) => ({
          id: `join-${viewer.userId}`,
          type: 'join' as const,
          userId: viewer.userId,
          name: viewer.username || 'Viewer',
          text: 'đang xem trực tiếp',
          avatar: viewer.avatar_url,
          createdAt: new Date().toISOString(),
        }))
      : [];

    return [...commentItems, ...reactionItems, ...joinItems]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-120);
  }, [isLiveActive, messages, reactions, viewers]);

  useEffect(() => {
    if (isNearBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    } else {
      setUnreadCount((value) => Math.min(value + 1, 99));
    }
  }, [activity.length, isNearBottom]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setIsNearBottom(distanceFromBottom < 80);
    if (distanceFromBottom < 80) setUnreadCount(0);
  };

  const jumpToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadCount(0);
    setIsNearBottom(true);
  };

  const usingPlaceholder = activity.length === 0 && !isLoading;

  return (
    <aside className={className}>
      <div
        className={cn(
          'relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl shadow-xl backdrop-blur-xl',
          dark
            ? 'border border-white/10 bg-black/72 text-white'
            : 'border border-gold/20 bg-card/85',
          compact && 'min-h-0 rounded-none border-x-0 border-b-0',
        )}
      >
        <div className={cn('border-b px-3 py-3', dark ? 'border-white/10 bg-white/[0.04]' : 'bg-gradient-to-r from-primary/10 via-card to-gold/10')}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-bold">{compact ? 'Chat trực tiếp' : 'Live chat & activity'}</h2>
              <p className={cn('text-xs', dark ? 'text-white/60' : 'text-muted-foreground')}>
                {isLiveActive ? `${viewers.length} người đang xem` : 'Livestream đã kết thúc'}
              </p>
            </div>
            <div className="flex -space-x-2">
              {viewers.slice(0, 5).map((viewer) => (
                <Avatar key={viewer.userId} className={cn('h-8 w-8 border-2', dark ? 'border-black' : 'border-card')}>
                  <AvatarImage src={viewer.avatar_url} />
                  <AvatarFallback className="text-[10px]">{viewer.username?.charAt(0)?.toUpperCase() || '?'}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          </div>
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overscroll-contain px-3">
          <div className="space-y-3 py-3">
            {isLoading && (
              <div className={cn('rounded-xl px-3 py-2 text-xs', dark ? 'bg-white/10 text-white/65' : 'bg-muted/35 text-muted-foreground')}>
                Đang tải live chat...
              </div>
            )}
            {usingPlaceholder && (
              <div className={cn('rounded-xl border border-dashed px-3 py-2 text-xs', dark ? 'border-white/15 bg-white/5 text-white/60' : 'bg-muted/35 text-muted-foreground')}>
                Chưa có bình luận hoặc tương tác nào. Hãy là người đầu tiên bắt đầu cuộc trò chuyện.
              </div>
            )}
            {!isLiveActive && (
              <div className={cn('rounded-xl border px-3 py-2 text-xs font-medium', dark ? 'border-white/15 bg-white/10 text-white/75' : 'border-primary/15 bg-primary/5 text-muted-foreground')}>
                Livestream đã kết thúc. Video phát lại sẽ sớm xuất hiện.
              </div>
            )}
            {activity.map((item) => {
              const isHost = !!hostUserId && item.userId === hostUserId;
              return (
                <div key={item.id} className="flex animate-in fade-in-0 slide-in-from-bottom-1 gap-2 duration-200">
                  <div className="relative shrink-0">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={item.avatar || ''} />
                      <AvatarFallback className={cn('text-xs', dark ? 'bg-white/10 text-white' : 'bg-muted')}>{item.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className={cn('absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border', dark ? 'border-black bg-black/90' : 'border-card bg-background')}>
                      {item.emoji ? <span className="text-xs">{item.emoji}</span> : <ActivityIcon type={item.type} />}
                    </span>
                  </div>
                  <div className={cn('min-w-0 rounded-2xl px-3 py-2', dark ? 'bg-white/10' : 'bg-muted/55')}>
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold">{item.name}</span>
                      {isHost && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">Host</span>}
                    </div>
                    <CommentText text={item.text} dark={dark} />
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        </div>

        {unreadCount > 0 && (
          <Button
            size="sm"
            className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-lg"
            onClick={jumpToBottom}
          >
            {unreadCount} bình luận mới
          </Button>
        )}

        {isLiveActive ? (
          <LiveChatComposer
            isAuthenticated={isAuthenticated}
            reactions={reactions}
            onSendMessage={onSendMessage}
            onReact={onReact}
            onShare={onShare}
            onGift={onGift}
            dark={dark}
          />
        ) : (
          <div className={dark ? 'border-t border-white/10 bg-black/80 p-3 text-center text-xs text-white/65' : 'border-t bg-card/90 p-3 text-center text-xs text-muted-foreground'}>
            Livestream đã kết thúc. Chat trực tiếp đã đóng.
          </div>
        )}
      </div>
    </aside>
  );
}
