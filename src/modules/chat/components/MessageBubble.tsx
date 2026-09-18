import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { MoreHorizontal, Reply, Pin, Edit, Trash2, Flag, Copy, X, Check, CheckCheck, Gift } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import type { Message, MessageReaction } from '../types';
import { RedEnvelopeCard } from './RedEnvelopeCard';
import { FileAttachment } from './FileAttachment';
import { getFileTypeFromUrl } from '../utils/fileUtils';
import { toast } from 'sonner';
import type { StickerMetadata, RedEnvelopeMetadata } from '@/types/realtimeRows';
import { rewriteGiftMessage } from '@/lib/giftMessagePreview';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  userId: string | null;
  onReply: (message: Message) => void;
  onReaction: (messageId: string, emoji: string, hasReacted: boolean) => void;
  onPin?: (messageId: string) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onReport?: (message: Message) => void;
  isPinned?: boolean;
  highlightId?: string | null;
  showReadStatus?: boolean;
}

const QUICK_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

export function MessageBubble({
  message,
  isOwn,
  showAvatar,
  userId,
  onReply,
  onReaction,
  onPin,
  onEdit,
  onDelete,
  onReport,
  isPinned,
  highlightId,
  showReadStatus,
}: MessageBubbleProps) {
  const [showReactions, setShowReactions] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const dateLocale = useDateLocale();

  if (message.is_deleted) {
    return (
      <div id={`msg-${message.id}`} className={cn('flex items-end gap-2', isOwn ? 'justify-end' : '')}>
        {!isOwn && showAvatar && (
          <Avatar className="h-8 w-8">
            <AvatarImage src={message.sender?.avatar_url || undefined} />
            <AvatarFallback className="text-xs">
              {(message.sender?.username || 'U')[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        {!isOwn && !showAvatar && <div className="w-8" />}
        <div className="px-4 py-2 rounded-2xl bg-muted text-muted-foreground italic text-sm">
          Tin nhắn đã bị xóa
        </div>
      </div>
    );
  }

  // Sticker message
  if (message.message_type === 'sticker') {
    const stickerMeta = (message.metadata ?? {}) as StickerMetadata;
    const stickerUrl = stickerMeta?.sticker?.url;
    return (
      <div id={`msg-${message.id}`} className={cn('flex items-end gap-2', isOwn ? 'justify-end' : '')}>
        {!isOwn && showAvatar && (
          <Avatar className="h-8 w-8">
            <AvatarImage src={message.sender?.avatar_url || undefined} />
            <AvatarFallback className="text-xs">{(message.sender?.username || 'U')[0].toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        {!isOwn && !showAvatar && <div className="w-8" />}
        {stickerUrl ? (
          <img src={stickerUrl} alt="sticker" className="w-24 h-24 object-contain" />
        ) : (
          <span className="text-4xl">🎨</span>
        )}
      </div>
    );
  }

  // Red envelope message
  if (message.message_type === 'red_envelope') {
    const meta = (message.metadata ?? {}) as RedEnvelopeMetadata;
    return (
      <div id={`msg-${message.id}`} className={cn('flex items-end gap-2', isOwn ? 'justify-end' : '')}>
        {!isOwn && showAvatar && (
          <Avatar className="h-8 w-8">
            <AvatarImage src={message.sender?.avatar_url || undefined} />
            <AvatarFallback className="text-xs">{(message.sender?.username || 'U')[0].toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        {!isOwn && !showAvatar && <div className="w-8" />}
        <RedEnvelopeCard envelopeId={meta?.envelopeId} userId={userId} />
      </div>
    );
  }

  // Group reactions by emoji
  const reactionGroups = new Map<string, { count: number; hasReacted: boolean }>();
  message.reactions?.forEach((r: MessageReaction) => {
    const existing = reactionGroups.get(r.emoji) || { count: 0, hasReacted: false };
    existing.count++;
    if (r.user_id === userId) existing.hasReacted = true;
    reactionGroups.set(r.emoji, existing);
  });

  const isHighlighted = highlightId === message.id;

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        'group flex items-end gap-2 transition-colors duration-700',
        isOwn ? 'justify-end' : '',
        isHighlighted && 'bg-primary/10 rounded-lg -mx-2 px-2 py-1'
      )}
      onMouseEnter={() => setShowReactions(true)}
      onMouseLeave={() => setShowReactions(false)}
    >
      {!isOwn && showAvatar && (
        <Avatar className="h-8 w-8">
          <AvatarImage src={message.sender?.avatar_url || undefined} />
          <AvatarFallback className="text-xs">
            {(message.sender?.username || 'U')[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      {!isOwn && !showAvatar && <div className="w-8" />}

      <div className={cn('max-w-[85%] sm:max-w-[70%] min-w-0 relative', isOwn ? 'order-first' : '')}>
        {/* Sender name for group */}
        {!isOwn && showAvatar && (
          <p className="text-xs text-muted-foreground mb-1 ml-3">
            {message.sender?.full_name || message.sender?.username || 'Người dùng'}
          </p>
        )}

        {/* Reply preview */}
        {message.reply_to && (
          <div className="ml-3 mb-1 px-3 py-1 rounded-lg bg-muted/50 border-l-2 border-primary text-xs text-muted-foreground truncate max-w-[250px]">
            {message.reply_to.content || '(Tin nhắn)'}
          </div>
        )}

        <div className="flex items-center gap-1">
          {isOwn && showReactions && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onReply(message)}>
                    <Reply className="h-4 w-4 mr-2" /> Trả lời
                  </DropdownMenuItem>
                  {onEdit && <DropdownMenuItem onClick={() => onEdit(message)}>
                    <Edit className="h-4 w-4 mr-2" /> Sửa
                  </DropdownMenuItem>}
                  {onPin && <DropdownMenuItem onClick={() => onPin(message.id)}>
                    <Pin className="h-4 w-4 mr-2" /> {isPinned ? 'Bỏ ghim' : 'Ghim'}
                  </DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => {
                    navigator.clipboard.writeText(message.content || '');
                    toast.success('Đã sao chép');
                  }}>
                    <Copy className="h-4 w-4 mr-2" /> Sao chép
                  </DropdownMenuItem>
                  {onDelete && <DropdownMenuItem className="text-destructive" onClick={() => onDelete(message.id)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Xóa
                  </DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div
            className={cn(
              'px-4 py-2 rounded-2xl break-words whitespace-pre-wrap',
              isOwn
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-muted rounded-bl-md',
              isPinned && 'ring-1 ring-primary/30'
            )}
          >
            {/* Media */}
            {message.media_urls && Array.isArray(message.media_urls) && (message.media_urls as unknown[]).length > 0 && (() => {
              try {
                const items = message.media_urls as unknown[];
                const donationItems = items.filter((item): item is Record<string, unknown> =>
                  typeof item === 'object' && item !== null && (item as any).type === 'donation'
                );
                const fileUrls = items.filter((item): item is string => typeof item === 'string');

                return (
                  <div className="mb-2 space-y-1">
                    {donationItems.map((d, i) => (
                      <div key={`donation-${i}`} className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/30">
                        <Gift className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">
                          🎁 {Number(d.amount).toLocaleString()} {String(d.token_symbol)}
                        </span>
                      </div>
                    ))}
                    {fileUrls.map((url, i) => {
                      try {
                        const fileType = getFileTypeFromUrl(url);
                        if (fileType === 'image') {
                          return <img key={i} src={url} alt="" className="max-w-full rounded-lg max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity" loading="lazy" onClick={() => setSelectedImage(url)} />;
                        }
                        if (fileType === 'video') {
                          return <video key={i} src={url} controls className="max-w-full rounded-lg max-h-60" />;
                        }
                        return <FileAttachment key={i} url={url} isOwn={isOwn} />;
                      } catch {
                        return null;
                      }
                    })}
                  </div>
                );
              } catch {
                return null;
              }
            })()}
            {message.content && (
              <p className="text-sm">
                {rewriteGiftMessage({ rawText: message.content, viewerIsSender: isOwn }).full}
              </p>
            )}
            <div className="flex items-center justify-end gap-1 mt-1">
              {message.edited_at && <span className="text-[10px] opacity-60">(đã sửa)</span>}
              <span className="text-[10px] opacity-60">
                {message.created_at
                  ? formatDistanceToNow(new Date(message.created_at), { addSuffix: false, locale: dateLocale })
                  : ''}
              </span>
              {isOwn && showReadStatus && (
                message.read_by && message.read_by.length > 0
                  ? <CheckCheck className="h-3 w-3 text-primary" />
                  : <Check className="h-3 w-3 opacity-60" />
              )}
            </div>
          </div>

          {!isOwn && showReactions && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => onReply(message)}>
                    <Reply className="h-4 w-4 mr-2" /> Trả lời
                  </DropdownMenuItem>
                  {onPin && <DropdownMenuItem onClick={() => onPin(message.id)}>
                    <Pin className="h-4 w-4 mr-2" /> {isPinned ? 'Bỏ ghim' : 'Ghim'}
                  </DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => {
                    navigator.clipboard.writeText(message.content || '');
                    toast.success('Đã sao chép');
                  }}>
                    <Copy className="h-4 w-4 mr-2" /> Sao chép
                  </DropdownMenuItem>
                  {onReport && <DropdownMenuItem onClick={() => onReport(message)}>
                    <Flag className="h-4 w-4 mr-2" /> Phản hồi
                  </DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Quick reactions */}
        {showReactions && (
          <div className={cn(
            'absolute -bottom-3 flex gap-0.5 bg-card border rounded-full px-1 py-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10',
            isOwn ? 'right-0' : 'left-10'
          )}>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  const hasReacted = reactionGroups.get(emoji)?.hasReacted || false;
                  onReaction(message.id, emoji, hasReacted);
                }}
                className="text-sm hover:scale-125 transition-transform p-0.5"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Reaction badges */}
        {reactionGroups.size > 0 && (
          <div className={cn('flex gap-1 mt-1 flex-wrap', isOwn ? 'justify-end' : 'ml-3')}>
            {Array.from(reactionGroups.entries()).map(([emoji, { count, hasReacted }]) => (
              <button
                key={emoji}
                onClick={() => onReaction(message.id, emoji, hasReacted)}
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full border flex items-center gap-0.5',
                  hasReacted ? 'border-primary bg-primary/10' : 'border-border'
                )}
              >
                <span>{emoji}</span>
                <span>{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Image viewer dialog */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-black/95 border-none [&>button]:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full"
            onClick={() => setSelectedImage(null)}
          >
            <X className="h-5 w-5" />
          </Button>
          {selectedImage && (
            <img
              src={selectedImage}
              alt="Xem ảnh phóng to"
              className="w-full h-auto max-h-[90vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
