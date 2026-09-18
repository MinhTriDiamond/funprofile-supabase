import { Heart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLiveReactions } from '@/modules/live/hooks/useLiveReactions';

interface LiveReactionsPanelProps {
  sessionId?: string;
}

const QUICK_REACTIONS = ['❤️', '👏', '🔥', '😍'];

export function LiveReactionsPanel({ sessionId }: LiveReactionsPanelProps) {
  const { reactions, sendReaction } = useLiveReactions(sessionId);
  const recent = reactions.slice(-12).reverse();

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Heart className="h-4 w-4" />
          Reactions
        </div>
        <span className="text-xs text-muted-foreground">{reactions.length} lượt</span>
      </div>

      <div className="flex gap-2">
        {QUICK_REACTIONS.map((emoji) => (
          <Button
            key={emoji}
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 px-0 text-base"
            onClick={() => void sendReaction(emoji)}
            disabled={!sessionId}
          >
            {emoji}
          </Button>
        ))}
      </div>

      {recent.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {recent.map((reaction) => (
            <span key={reaction.id} className="rounded-full bg-muted px-2 py-1 text-sm">
              {reaction.emoji}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          Reactions sẽ xuất hiện tại đây.
        </div>
      )}
    </div>
  );
}
