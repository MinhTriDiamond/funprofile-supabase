import { useCallback, useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLiveReactions } from '../hooks/useLiveReactions';

const EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

interface FloatingEmoji {
  id: string;
  emoji: string;
  left: number;
}

interface FloatingReactionsProps {
  sessionId: string;
  showPicker?: boolean;
}

export function FloatingReactions({ sessionId, showPicker = false }: FloatingReactionsProps) {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const { reactions, sendReaction } = useLiveReactions(sessionId);

  useEffect(() => {
    if (reactions.length === 0) return;
    const latest = reactions[reactions.length - 1];
    const id = `${latest.id}-${latest.created_at}`;
    const left = 10 + Math.random() * 80;
    setFloatingEmojis((prev) => [...prev.slice(-40), { id, emoji: latest.emoji, left }]);
  }, [reactions]);

  useEffect(() => {
    if (floatingEmojis.length === 0) return;
    const timer = setTimeout(() => {
      setFloatingEmojis((prev) => prev.slice(1));
    }, 2500);
    return () => clearTimeout(timer);
  }, [floatingEmojis]);

  const handleSendReaction = useCallback(
    async (emoji: string) => {
      await sendReaction(emoji);
    },
    [sendReaction]
  );

  return (
    <>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {floatingEmojis.map((fe) => (
          <span
            key={fe.id}
            className="absolute text-2xl animate-float-up"
            style={{ left: `${fe.left}%`, bottom: '10%' }}
          >
            {fe.emoji}
          </span>
        ))}
      </div>

      {!showPicker && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute bottom-3 right-3 z-10 bg-background/30 hover:bg-background/50 text-destructive rounded-full h-10 w-10"
          onClick={() => handleSendReaction('❤️')}
        >
          <Heart className="h-5 w-5 fill-current" />
        </Button>
      )}

      {showPicker && (
        <div className="flex items-center gap-1">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="text-xl hover:scale-125 transition-transform p-1.5 rounded-full hover:bg-accent"
              onClick={() => handleSendReaction(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
