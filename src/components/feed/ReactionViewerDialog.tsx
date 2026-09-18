import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { PremiumEmoji } from '@/components/ui/PremiumEmoji';
import { useLanguage } from '@/i18n/LanguageContext';
import { getReactionAsset } from '@/lib/reactionAssets';

const getReactionIcons = (t: (key: string) => string): Record<string, { icon: string; label: string; color: string }> => ({
  gratitude: { icon: '🙏', label: t('reactionGratitudeLabel'), color: '#a855f7' },
  care: { icon: '🥰', label: t('reactionCareLabel'), color: '#f97316' },
  like: { icon: '👍', label: t('reactionLikeLabel'), color: '#3b82f6' },
  love: { icon: '❤️', label: t('reactionLoveLabel'), color: '#ef4444' },
  haha: { icon: '😂', label: t('reactionHahaLabel'), color: '#eab308' },
  wow: { icon: '😮', label: t('reactionWowLabel'), color: '#eab308' },
});

interface ReactionUser {
  id: string;
  username: string;
  avatar_url: string | null;
  full_name: string | null;
  type: string;
}

interface ReactionCount {
  type: string;
  count: number;
}

interface ReactionViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  reactions: ReactionCount[];
  totalCount: number;
}

export const ReactionViewerDialog = ({
  open,
  onOpenChange,
  postId,
  reactions,
  totalCount,
}: ReactionViewerDialogProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const REACTION_ICONS = getReactionIcons(t);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [users, setUsers] = useState<ReactionUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && postId) {
      fetchReactionUsers();
    }
  }, [open, postId, selectedType]);

  const fetchReactionUsers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('reactions')
        .select(`
          type,
          user_id,
          public_profiles:user_id (
            id,
            username,
            avatar_url,
            full_name
          )
        `)
        .eq('post_id', postId)
        .is('comment_id', null);

      if (selectedType) {
        query = query.eq('type', selectedType);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      const formattedUsers: ReactionUser[] = (data || []).map((item: any) => ({
      id: item.public_profiles?.id || item.user_id,
      username: item.public_profiles?.username || 'Unknown',
      avatar_url: item.public_profiles?.avatar_url,
      full_name: item.public_profiles?.display_name,
        type: item.type,
      }));

      setUsers(formattedUsers);
    } catch (error) {
      console.error('Error fetching reaction users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserClick = (username: string) => {
    onOpenChange(false);
    navigate(`/${username}`);
  };

  const sortedReactions = [...reactions]
    .sort((a, b) => b.count - a.count)
    .filter((r) => r.count > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-center">{t('emotionsTitle')}</DialogTitle>
        </DialogHeader>

        {/* Reaction Type Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-2 border-b border-border">
          <button
            onClick={() => setSelectedType(null)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              selectedType === null
                ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/25'
                : 'bg-transparent hover:bg-muted/60 text-muted-foreground'
            }`}
          >
            {t('allReactions')}
            <span className="text-xs opacity-70">{totalCount}</span>
          </button>
          
          {sortedReactions.map((reaction) => {
            const info = REACTION_ICONS[reaction.type];
            if (!info) return null;
            
            return (
              <button
                key={reaction.type}
                onClick={() => setSelectedType(reaction.type)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  selectedType === reaction.type
                    ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/25'
                    : 'bg-transparent hover:bg-muted/60 text-muted-foreground'
                }`}
              >
                <PremiumEmoji type={reaction.type} emoji={info.icon} size={20} />
                <span className="text-xs opacity-70">{reaction.count}</span>
              </button>
            );
          })}
        </div>

        {/* Users List */}
        <div className="flex-1 overflow-y-auto space-y-1 min-h-[200px]">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {t('noReactionsYet')}
            </div>
          ) : (
            users.map((user, index) => {
              const reactionInfo = REACTION_ICONS[user.type];
              return (
                <button
                  key={`${user.id}-${index}`}
                  onClick={() => handleUserClick(user.username)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors text-left"
                >
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={user.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {user.username?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {reactionInfo && (
                      <span
                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center bg-card ring-2 ring-card shadow-sm"
                      >
                        <PremiumEmoji type={user.type} emoji={reactionInfo.icon} size={14} glow />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {user.full_name || user.username}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      @{user.username}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
