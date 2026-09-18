import { useState, useEffect, useRef } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useLanguage } from '@/i18n/LanguageContext';
import { PremiumEmoji } from '@/components/ui/PremiumEmoji';
import { REACTION_ASSETS } from '@/lib/reactionAssets';

// Reaction type definitions - labels will be loaded from translations
const REACTION_TYPES = [
  { type: 'gratitude', emoji: '🙏', labelKey: 'reactionGratitude', color: 'text-purple-500' },
  { type: 'care', emoji: '🥰', labelKey: 'reactionCare', color: 'text-orange-500' },
  { type: 'like', emoji: '👍', labelKey: 'like', color: 'text-blue-500' },
  { type: 'love', emoji: '❤️', labelKey: 'reactionLove', color: 'text-red-500' },
  { type: 'haha', emoji: '😂', labelKey: 'haha', color: 'text-yellow-500' },
  { type: 'wow', emoji: '😮', labelKey: 'reactionWow', color: 'text-yellow-600' },
];

interface CommentReactionButtonProps {
  commentId: string;
  onReactionChange?: () => void;
}

interface CommentReaction {
  id: string;
  user_id: string;
  type: string;
  profiles: {
    username: string;
    avatar_url: string | null;
  };
}

export const CommentReactionButton = ({ commentId, onReactionChange }: CommentReactionButtonProps) => {
  const { t } = useLanguage();
  const { userId: currentUserId } = useCurrentUser();
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [reactions, setReactions] = useState<CommentReaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);
  
  // Build reactions with translated labels
  const CHAKRA_REACTIONS = REACTION_TYPES.map(r => ({
    ...r,
    label: t(r.labelKey as never /* dynamic i18n key */)
  }));

  useEffect(() => {
    fetchReactions();
    
    const channel = supabase
      .channel(`comment-reactions-${commentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reactions',
          filter: `comment_id=eq.${commentId}`,
        },
        () => {
          fetchReactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [commentId]);

  const fetchReactions = async () => {
    try {
      const { data, error } = await supabase
        .from('reactions')
        .select(`
          id,
          user_id,
          type,
          profiles (username, avatar_url)
        `)
        .eq('comment_id', commentId);

      if (!error && data) {
        setReactions(data as CommentReaction[]);
        
        const counts: Record<string, number> = {};
        data.forEach(r => {
          counts[r.type] = (counts[r.type] || 0) + 1;
        });
        setReactionCounts(counts);
        
        const userReact = currentUserId ? data.find(r => r.user_id === currentUserId) : null;
        setUserReaction(userReact?.type || null);
      }
    } catch (error) {
      console.error('Error fetching comment reactions:', error);
    }
  };

  const handleReaction = async (reactionType: string) => {
    if (!currentUserId) {
      toast.error(t('pleaseLoginToReact'));
      return;
    }

    setLoading(true);
    setShowReactionPicker(false);

    try {
      if (userReaction === reactionType) {
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', currentUserId);

        if (!error) {
          setUserReaction(null);
          navigator.vibrate?.(10);
          onReactionChange?.();
        } else {
          throw error;
        }
      } else {
        if (userReaction) {
          await supabase
            .from('reactions')
            .delete()
            .eq('comment_id', commentId)
            .eq('user_id', currentUserId);
        }
        
        const { error } = await supabase
          .from('reactions')
          .insert({
            comment_id: commentId,
            user_id: currentUserId,
            type: reactionType,
          });

        if (!error) {
          setUserReaction(reactionType);
          navigator.vibrate?.(10);
          onReactionChange?.();
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Comment reaction error:', error);
      toast.error(t('cannotUpdateReaction'));
    } finally {
      setLoading(false);
    }
  };

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setShowReactionPicker(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowReactionPicker(false);
    }, 300);
  };

  const currentReaction = userReaction 
    ? CHAKRA_REACTIONS.find(r => r.type === userReaction) 
    : null;

  // Get top 3 reaction types by count
  const topReactions = Object.entries(reactionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => CHAKRA_REACTIONS.find(r => r.type === type))
    .filter(Boolean);

  return (
    <div className="relative" ref={containerRef}>
      <HoverCard openDelay={200}>
        <HoverCardTrigger asChild>
          <div
            className="inline-flex items-center"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleReaction(userReaction || 'love')}
              disabled={loading}
              className={`text-xs gap-1.5 transition-all duration-300 hover:bg-primary/10 ${
                userReaction 
                  ? currentReaction?.color || 'text-red-500'
                  : 'text-muted-foreground hover:text-primary'
              }`}
            >
              {currentReaction ? (
                <span className="animate-bounce-in"><PremiumEmoji type={currentReaction.type} size={18} priority /></span>
              ) : (
                <Heart className="w-3.5 h-3.5" />
              )}
              {totalReactions > 0 && (
                <span className="font-medium">{totalReactions}</span>
              )}
            </Button>
            
            {/* Top reaction emojis display */}
            {topReactions.length > 0 && (
              <div className="flex -space-x-1 ml-1">
                {topReactions.map((reaction, idx) => (
                  <span 
                    key={reaction?.type} 
                    className="text-sm"
                    style={{ zIndex: 3 - idx }}
                  >
                    <PremiumEmoji type={reaction?.type} size={14} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </HoverCardTrigger>
        
        {reactions.length > 0 && (
          <HoverCardContent className="w-64 p-3 bg-card border-primary/20">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-primary">Reactions</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                {reactions.map((reaction) => {
                  const reactionInfo = CHAKRA_REACTIONS.find(r => r.type === reaction.type);
                  return (
                    <div key={reaction.id} className="flex items-center gap-2">
                      <PremiumEmoji type={reaction.type} size={16} />
                      <Avatar className="w-5 h-5">
                        <AvatarFallback className="text-xs bg-primary/10">
                          {reaction.profiles?.username?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">{reaction.profiles?.username || t('anonymous')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </HoverCardContent>
        )}
      </HoverCard>

      {/* Reaction Picker Popup */}
      {showReactionPicker && (
        <div
          className="absolute bottom-full left-0 mb-2 z-50 animate-scale-in"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className="fun-reaction-bar relative flex items-center gap-0.5 px-1 py-0.5 rounded-[20px]"
          >
            {CHAKRA_REACTIONS.map((reaction, idx) => {
              const isActive = userReaction === reaction.type;
              return (
                <button
                  key={reaction.type}
                  onClick={() => handleReaction(reaction.type)}
                  disabled={loading}
                  aria-label={reaction.label}
                  aria-pressed={isActive}
                  className="fun-reaction-item relative w-9 h-9 flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/50 group"
                  style={{
                    transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.28) translateY(-10px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = isActive ? 'scale(1.1)' : 'scale(1)';
                  }}
                  title={reaction.label}
                >
                  <PremiumEmoji type={reaction.type} size={26} priority glow={isActive} />
                  <span className="fun-reaction-tooltip absolute -top-8 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100">
                    {reaction.label}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Bridge element */}
          <div className="absolute -bottom-2 left-0 w-full h-4" />
        </div>
      )}
    </div>
  );
};
