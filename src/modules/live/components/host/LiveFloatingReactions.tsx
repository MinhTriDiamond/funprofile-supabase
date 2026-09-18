import { useEffect, useState } from 'react';
import type { LiveReaction } from '../../hooks/useLiveReactions';

interface FloatingEmoji {
  id: string;
  emoji: string;
  right: number;
  size: number;
}

interface LiveFloatingReactionsProps {
  reactions: LiveReaction[];
}

export function LiveFloatingReactions({ reactions }: LiveFloatingReactionsProps) {
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);

  useEffect(() => {
    if (reactions.length === 0) return;
    const latest = reactions[reactions.length - 1];
    setFloating((prev) => [
      ...prev.slice(-36),
      {
        id: `${latest.id}-${latest.created_at}`,
        emoji: latest.emoji,
        right: 8 + Math.random() * 18,
        size: 24 + Math.random() * 12,
      },
    ]);
  }, [reactions]);

  useEffect(() => {
    if (floating.length === 0) return;
    const timer = window.setTimeout(() => setFloating((prev) => prev.slice(1)), 2400);
    return () => window.clearTimeout(timer);
  }, [floating]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {floating.map((item) => (
        <span
          key={item.id}
          className="absolute animate-float-up drop-shadow-lg"
          style={{ right: `${item.right}%`, bottom: '14%', fontSize: `${item.size}px` }}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  );
}
