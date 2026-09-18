import { useState } from 'react';
import { Gift, Laugh, Send, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHaptics } from '@/hooks/useHaptics';
import { LiveFloatingReactions } from './LiveFloatingReactions';
import type { LiveReaction } from '../../hooks/useLiveReactions';

interface LiveChatComposerProps {
  isAuthenticated: boolean;
  reactions: LiveReaction[];
  onSendMessage: (message: string) => Promise<void>;
  onReact: (emoji: string) => Promise<boolean>;
  onShare?: () => void;
  onGift?: () => void;
  dark?: boolean;
}

export function LiveChatComposer({
  isAuthenticated,
  reactions,
  onSendMessage,
  onReact,
  onShare,
  onGift,
  dark = false,
}: LiveChatComposerProps) {
  const [text, setText] = useState('');
  const haptic = useHaptics();

  const handleSend = async () => {
    const value = text.trim();
    if (!value) return;
    try {
      haptic('medium');
      await onSendMessage(value);
      setText('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể gửi bình luận');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={dark ? 'border-t border-white/10 bg-black/80 p-3 text-center text-xs text-white/65' : 'border-t bg-card/90 p-3 text-center text-xs text-muted-foreground'}>
        Đăng nhập để bình luận và tương tác với livestream.
      </div>
    );
  }

  return (
    <div className={dark ? 'border-t border-white/10 bg-black/86 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-white backdrop-blur-xl' : 'border-t bg-card/95 p-2'}>
      <div className="mb-2 flex items-center justify-between gap-2 overflow-x-auto">
        <LiveFloatingReactions
          reactions={reactions}
          onReact={onReact}
          showPicker
          className="flex items-center gap-1"
        />
        <div className="flex shrink-0 items-center gap-1">
          {onGift && (
            <Button
              variant="ghost"
              size="icon"
              className={dark ? 'h-11 w-11 rounded-full bg-amber-400/15 text-amber-200 hover:bg-amber-400/25' : 'h-11 w-11 rounded-full'}
              onClick={onGift}
              aria-label="Gửi Happy Camly Coin"
            >
              <Gift className="h-4 w-4" />
            </Button>
          )}
          {onShare && (
            <Button
              variant="ghost"
              size="icon"
              className={dark ? 'h-11 w-11 rounded-full bg-white/10 text-white hover:bg-white/15' : 'h-11 w-11 rounded-full'}
              onClick={onShare}
              aria-label="Chia sẻ live"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className={dark ? 'h-11 w-11 shrink-0 rounded-full bg-white/10 text-white hover:bg-white/15' : 'h-11 w-11 shrink-0 rounded-full'}
          onClick={() => toast.info('Bảng emoji sẽ sớm ra mắt.')}
          aria-label="Mở emoji"
        >
          <Laugh className="h-4 w-4" />
        </Button>
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Viết bình luận tích cực…"
          className={dark ? 'h-11 rounded-full border-white/10 bg-white/10 text-white placeholder:text-white/50 focus-visible:ring-emerald-300/70' : 'h-11 rounded-full bg-muted/70'}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSend();
          }}
        />
        <Button size="icon" className="h-11 w-11 shrink-0 rounded-full" onClick={handleSend} disabled={!text.trim()} aria-label="Gửi bình luận">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
