import { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Message } from '@/hooks/useMessages';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LazyImage } from '@/components/ui/LazyImage';
import { DonationMessage } from '@/components/donations/DonationMessage';
import { cn } from '@/lib/utils';
import { linkifyText } from '@/utils/linkifyText';
import { format } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { Reply, SmilePlus, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  currentUserId: string | null;
  onReply: () => void;
  onReaction: (emoji: string, hasReacted: boolean) => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  showAvatar,
  currentUserId,
  onReply,
  onReaction,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const navigate = useNavigate();
  const dateLocale = useDateLocale();

  const handleAvatarClick = () => {
    if (message.sender?.id) {
      navigate(`/profile/${message.sender.id}`);
    }
  };

  const mediaUrls = Array.isArray(message.media_urls) ? message.media_urls as string[] : [];
  
  // Check if this is a donation message
  const metadata = message.media_urls as unknown as { type?: string; donation_id?: string } | null;
  const isDonationMessage = metadata?.type === 'donation' && metadata?.donation_id;
  
  // Group reactions by emoji
  const reactionCounts = message.reactions?.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const userReactions = message.reactions
    ?.filter((r) => r.user_id === currentUserId)
    .map((r) => r.emoji) || [];

  const isRead = message.read_by && message.read_by.length > 0;

  // Render donation message with special styling
  if (isDonationMessage) {
    const donationMetadata = metadata as {
      type: string;
      donation_id: string;
      amount: string;
      token_symbol: string;
      message?: string | null;
      tx_hash: string;
      sender_username: string;
      sender_avatar_url?: string | null;
      recipient_username: string;
      recipient_avatar_url?: string | null;
      light_score_earned?: number;
      created_at: string;
    };

    return (
      <div
        className={cn('flex gap-2 group', isOwn ? 'flex-row-reverse' : '')}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Avatar */}
        <div className="w-8 flex-shrink-0">
          {showAvatar && !isOwn && message.sender && (
            <Avatar className="h-8 w-8 cursor-pointer hover:ring-2 hover:ring-primary transition-all" onClick={handleAvatarClick}>
              <AvatarImage
                src={message.sender.avatar_url || undefined}
                alt={message.sender.username}
              />
              <AvatarFallback>
                {message.sender.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </div>

        {/* Donation Message */}
        <div className={cn('flex flex-col', isOwn ? 'items-end' : 'items-start')}>
          <DonationMessage metadata={donationMetadata} isOwn={isOwn} />
          
          {/* Timestamp */}
          <div className="flex items-center gap-1 mt-1 px-2">
            <span className="text-[10px] text-muted-foreground">
              {message.created_at && format(new Date(message.created_at), 'HH:mm', { locale: dateLocale })}
            </span>
            {isOwn && (
              <span className="text-muted-foreground">
                {isRead ? (
                  <CheckCheck className="h-3 w-3 text-primary" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('flex gap-2 group', isOwn ? 'flex-row-reverse' : '')}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className="w-8 flex-shrink-0">
        {showAvatar && !isOwn && message.sender && (
          <Avatar className="h-8 w-8 cursor-pointer hover:ring-2 hover:ring-primary transition-all" onClick={handleAvatarClick}>
            <AvatarImage
              src={message.sender.avatar_url || undefined}
              alt={message.sender.username}
            />
            <AvatarFallback>
              {message.sender.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Message content */}
      <div className={cn('flex flex-col max-w-[70%]', isOwn ? 'items-end' : 'items-start')}>
        {/* Reply preview */}
        {message.reply_to && (
          <div className={cn(
            'text-xs px-3 py-1 rounded-t-lg bg-muted/50 border-l-2',
            isOwn ? 'border-primary' : 'border-muted-foreground'
          )}>
            <span className="text-muted-foreground">
              Trả lời {message.reply_to.sender?.username || 'tin nhắn'}
            </span>
            <p className="truncate">{message.reply_to.content}</p>
          </div>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'px-4 py-2 rounded-2xl relative',
            isOwn
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted rounded-bl-md',
            message.reply_to && 'rounded-t-none'
          )}
        >
          {/* Text content */}
          {message.content && (
            <p className="whitespace-pre-wrap break-words">{linkifyText(message.content)}</p>
          )}

          {/* Media */}
          {mediaUrls.length > 0 && (
            <div className={cn('mt-2 grid gap-1', mediaUrls.length > 1 ? 'grid-cols-2' : '')}>
              {mediaUrls.map((url, i) => (
                <LazyImage
                  key={i}
                  src={url}
                  alt=""
                  className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90"
                />
              ))}
            </div>
          )}

          {/* Reactions display */}
          {Object.keys(reactionCounts).length > 0 && (
            <div className={cn(
              'absolute -bottom-3 flex gap-0.5 bg-card rounded-full px-1 py-0.5 shadow-sm border',
              isOwn ? 'right-2' : 'left-2'
            )}>
              {Object.entries(reactionCounts).map(([emoji, count]) => (
                <span key={emoji} className="text-xs">
                  {emoji}{count > 1 && <span className="text-muted-foreground">{count}</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Timestamp & read status */}
        <div className="flex items-center gap-1 mt-1 px-2">
          <span className="text-[10px] text-muted-foreground">
            {message.created_at && format(new Date(message.created_at), 'HH:mm', { locale: dateLocale })}
          </span>
          {isOwn && (
            <span className="text-muted-foreground">
              {isRead ? (
                <CheckCheck className="h-3 w-3 text-primary" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className={cn(
          'flex items-center gap-1 opacity-0 transition-opacity',
          showActions && 'opacity-100'
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onReply}
            >
              <Reply className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Trả lời</TooltipContent>
        </Tooltip>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <SmilePlus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" side="top">
            <div className="flex gap-1">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onReaction(emoji, userReactions.includes(emoji))}
                  className={cn(
                    'text-xl p-1 rounded hover:bg-accent transition-colors',
                    userReactions.includes(emoji) && 'bg-accent'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
});
