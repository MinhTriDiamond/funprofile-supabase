import { Bell, Heart, MessageCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FollowButton } from '@/components/reels/FollowButton';

interface LiveViewerActionsProps {
  hostUserId: string;
  currentUserId: string | null;
  onReact: (emoji: string) => Promise<boolean>;
  onShare: () => void;
}

export function LiveViewerActions({ hostUserId, currentUserId, onReact, onShare }: LiveViewerActionsProps) {
  const isOwnLive = !!currentUserId && currentUserId === hostUserId;

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-center gap-2 rounded-2xl border border-gold/20 bg-card/95 p-2 shadow-2xl backdrop-blur lg:hidden">
      <Button variant="ghost" size="sm" className="flex-1 gap-1.5 rounded-xl">
        <MessageCircle className="h-4 w-4" />
        Binh luan
      </Button>
      <Button variant="ghost" size="sm" className="flex-1 gap-1.5 rounded-xl" onClick={() => onReact('❤️')}>
        <Heart className="h-4 w-4 fill-current text-rose-600" />
        Tha tim
      </Button>
      <Button variant="ghost" size="sm" className="flex-1 gap-1.5 rounded-xl" onClick={onShare}>
        <Share2 className="h-4 w-4" />
        Chia se
      </Button>
      {!isOwnLive && (
        <div className="hidden sm:block [&>button]:!border-primary [&>button]:!text-primary [&>button:hover]:!bg-primary/10 [&>span]:!border-primary/30 [&>span]:!text-primary">
          <FollowButton userId={hostUserId} />
        </div>
      )}
      {!isOwnLive && (
        <Button variant="ghost" size="icon" className="rounded-xl sm:hidden" aria-label="Theo doi">
          <Bell className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
