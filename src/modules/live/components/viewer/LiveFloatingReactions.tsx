import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHaptics } from '@/hooks/useHaptics';
import type { LiveReaction } from '../../hooks/useLiveReactions';
import { LIVE_REACTION_EMOJIS } from './liveReactionEmojis';

interface FloatingEmoji {
  id: string;
  emoji: string;
  left: number;
  size: number;
}

interface LiveFloatingReactionsProps {
  reactions: LiveReaction[];
  onReact: (emoji: string) => Promise<boolean>;
  showPicker?: boolean;
  className?: string;
}

export function LiveFloatingReactions({ reactions, onReact, showPicker = false, className }: LiveFloatingReactionsProps) {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const haptic = useHaptics();

  useEffect(() => {
    if (reactions.length === 0) return;
    const latest = reactions[reactions.length - 1];
    setFloatingEmojis((prev) => [
      ...prev.slice(-36),
      {
        id: `${latest.id}-${latest.created_at}`,
        emoji: latest.emoji,
        left: 8 + Math.random() * 84,
        size: 34 + Math.random() * 18,
      },
    ]);
  }, [reactions]);

  useEffect(() => {
    if (floatingEmojis.length === 0) return;
    const timer = window.setTimeout(() => {
      setFloatingEmojis((prev) => prev.slice(1));
    }, 2300);
    return () => window.clearTimeout(timer);
  }, [floatingEmojis]);

  const send = (emoji: string) => {
    haptic('light');
    onReact(emoji);
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {floatingEmojis.map((item) => (
          <span
            key={item.id}
            className="absolute animate-float-up select-none drop-shadow-lg"
            style={{ left: `${item.left}%`, bottom: '12%', fontSize: `${item.size}px` }}
          >
            {item.emoji}
          </span>
        ))}
      </div>

      {showPicker ? (
        <div className={className || 'flex items-center gap-1'}>
          {LIVE_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/12 text-xl shadow-sm backdrop-blur transition hover:scale-110 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              onClick={() => send(emoji)}
              aria-label={`Gửi reaction ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="absolute bottom-4 left-4 z-30 h-11 w-11 rounded-full bg-white/90 text-rose-600 shadow-lg backdrop-blur hover:bg-white"
          onClick={() => send('❤️')}
          aria-label="Thả tim"
        >
          <Heart className="h-5 w-5 fill-current" />
        </Button>
      )}
    </>
  );
}
