import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ThumbsUp } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { usePplpEvaluate } from '@/hooks/usePplpEvaluate';
import { PremiumEmoji } from '@/components/ui/PremiumEmoji';
import { REACTION_LIST, getReactionAsset, type ReactionAsset } from '@/lib/reactionAssets';

const VIEWPORT_PADDING = 12;

interface ReactionButtonProps {
  postId: string;
  currentUserId: string;
  initialReaction?: string | null;
  likeCount: number;
  onReactionChange: (newCount: number, newReaction: string | null) => void;
}

interface BurstParticle {
  id: number;
  dx: number;
  dy: number;
}

export const ReactionButton = memo(function ReactionButton({
  postId,
  currentUserId,
  initialReaction = null,
  likeCount,
  onReactionChange,
}: ReactionButtonProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { evaluateAsync } = usePplpEvaluate();
  const REACTIONS: (ReactionAsset & { label: string })[] = REACTION_LIST.map((r) => ({
    ...r,
    label: t(r.labelKey),
  }));
  const [showReactions, setShowReactions] = useState(false);
  const [currentReaction, setCurrentReaction] = useState<string | null>(initialReaction);
  const [pulseKey, setPulseKey] = useState(0);
  const [particles, setParticles] = useState<BurstParticle[]>([]);
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null);
  const [swipeSelectedReaction, setSwipeSelectedReaction] = useState<string | null>(null);
  const [menuOffset, setMenuOffset] = useState(0);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressRef = useRef(false);
  const reactionMenuRef = useRef<HTMLDivElement>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const reactionButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lastHoveredRef = useRef<string | null>(null);

  useEffect(() => {
    setCurrentReaction(initialReaction);
  }, [initialReaction]);

  // Smart viewport alignment
  useEffect(() => {
    if (showReactions && reactionMenuRef.current) {
      const menuRect = reactionMenuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      let offset = 0;
      if (menuRect.left < VIEWPORT_PADDING) {
        offset = VIEWPORT_PADDING - menuRect.left;
      } else if (menuRect.right > viewportWidth - VIEWPORT_PADDING) {
        offset = viewportWidth - VIEWPORT_PADDING - menuRect.right;
      }
      setMenuOffset(offset);
    } else {
      setMenuOffset(0);
    }
  }, [showReactions]);

  // Note: bỏ lock body scroll (position:fixed) vì gây "nhảy trang" trên
  // Post Detail (scroll ở <main data-app-scroll>, không phải body).
  // Việc chặn scroll khi vuốt chọn emoji đã được đảm bảo bởi
  // `onTouchMove={(e) => e.preventDefault()}` trên chính menu picker.

  // Keyboard accessibility
  useEffect(() => {
    if (!showReactions) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowReactions(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showReactions]);

  const clearTimeouts = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = () => {
    clearTimeouts();
    setShowReactions(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowReactions(false);
      setHoveredReaction(null);
      setSwipeSelectedReaction(null);
    }, 250);
  };

  const triggerHaptic = useCallback((duration: number = 10) => {
    if (navigator.vibrate) navigator.vibrate(duration);
  }, []);

  const spawnParticles = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const next: BurstParticle[] = Array.from({ length: 6 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.3;
      const dist = 22 + Math.random() * 12;
      return {
        id: Date.now() + i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 10,
      };
    });
    setParticles(next);
    setTimeout(() => setParticles([]), 750);
  }, []);

  const getReactionAtPosition = useCallback((clientX: number, clientY: number): string | null => {
    for (const [type, button] of reactionButtonRefs.current.entries()) {
      const rect = button.getBoundingClientRect();
      const padding = 6;
      if (
        clientX >= rect.left - padding &&
        clientX <= rect.right + padding &&
        clientY >= rect.top - padding &&
        clientY <= rect.bottom + padding
      ) {
        return type;
      }
    }
    return null;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      isLongPressRef.current = false;
      setSwipeSelectedReaction(null);

      longPressTimeoutRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        setShowReactions(true);
        triggerHaptic(40);
      }, 350);
    },
    [triggerHaptic]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

      if (isLongPressRef.current && showReactions) {
        e.preventDefault();
        const reactionType = getReactionAtPosition(touch.clientX, touch.clientY);
        if (reactionType !== lastHoveredRef.current) {
          lastHoveredRef.current = reactionType;
          setHoveredReaction(reactionType);
          setSwipeSelectedReaction(reactionType);
          if (reactionType) triggerHaptic(8);
        }
      } else {
        if (deltaX > 10 || deltaY > 10) clearTimeouts();
      }
    },
    [clearTimeouts, showReactions, getReactionAtPosition, triggerHaptic]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeouts();

      if (isLongPressRef.current && swipeSelectedReaction) {
        triggerHaptic(20);
        handleReaction(swipeSelectedReaction);
        setShowReactions(false);
        setHoveredReaction(null);
        setSwipeSelectedReaction(null);
      } else if (isLongPressRef.current && showReactions) {
        hideTimeoutRef.current = setTimeout(() => {
          setShowReactions(false);
          setHoveredReaction(null);
        }, 2000);
      } else if (!isLongPressRef.current) {
        handleReaction(currentReaction || 'like');
      }

      touchStartRef.current = null;
      lastHoveredRef.current = null;
      isLongPressRef.current = false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearTimeouts, showReactions, currentReaction, swipeSelectedReaction, triggerHaptic]
  );

  const handleReaction = async (reactionType: string) => {
    if (!currentUserId) {
      toast.error(t('pleaseLoginToReact'), {
        action: { label: t('signIn'), onClick: () => navigate('/auth') },
      });
      return;
    }

    setShowReactions(false);
    const isToggleOff = currentReaction === reactionType;
    if (!isToggleOff) {
      setPulseKey((k) => k + 1);
      spawnParticles();
    }

    try {
      if (isToggleOff) {
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', currentUserId)
          .is('comment_id', null);
        if (error) throw error;
        setCurrentReaction(null);
        onReactionChange(likeCount - 1, null);
      } else {
        const { data: existingReaction } = await supabase
          .from('reactions')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', currentUserId)
          .is('comment_id', null)
          .maybeSingle();

        if (existingReaction) {
          const { error } = await supabase
            .from('reactions')
            .update({ type: reactionType })
            .eq('id', existingReaction.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('reactions').insert({
            post_id: postId,
            user_id: currentUserId,
            type: reactionType,
            comment_id: null,
          });
          if (error) throw error;
        }

        const wasNew = !currentReaction;
        setCurrentReaction(reactionType);
        onReactionChange(wasNew ? likeCount + 1 : likeCount, reactionType);

        if (wasNew) {
          evaluateAsync({ action_type: 'reaction', reference_id: postId });
        }
      }
    } catch (error: any) {
      console.error('Reaction error:', error);
      if (
        error?.message?.includes('permission') ||
        error?.message?.includes('denied') ||
        error?.code === '42501'
      ) {
        toast.error(t('systemPaused'), { description: t('tryAgain'), duration: 5000 });
      } else {
        toast.error(t('cannotUpdateReaction'), { description: t('tryAgain') });
      }
    }
  };

  const handleReactionSelect = (reactionType: string) => {
    setShowReactions(false);
    setHoveredReaction(null);
    setSwipeSelectedReaction(null);
    triggerHaptic(15);
    handleReaction(reactionType);
  };

  const activeReaction = getReactionAsset(currentReaction);
  const activeLabel = activeReaction ? t(activeReaction.labelKey) : t('like');

  return (
    <div
      ref={buttonContainerRef}
      className="relative flex-1 select-none"
      style={{ WebkitTouchCallout: 'none' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => handleReaction(currentReaction || 'like')}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        aria-label={activeReaction ? `${activeLabel} — ${t('clickToToggle') || ''}` : t('like')}
        aria-pressed={!!activeReaction}
        className={`relative flex-1 w-full min-h-[44px] flex items-center justify-center gap-1.5 py-2 rounded-md transition-all duration-200 hover:bg-secondary/60 active:bg-secondary select-none text-sm ${
          activeReaction ? 'font-semibold' : 'text-muted-foreground font-medium'
        }`}
        style={{
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          touchAction: showReactions ? 'none' : 'auto',
          color: activeReaction ? activeReaction.color : undefined,
          opacity: activeReaction ? 0.95 : 1,
        }}
      >
        {activeReaction ? (
          <span
            key={pulseKey}
            className="reaction-active-pulse pointer-events-none inline-flex"
          >
            <PremiumEmoji type={activeReaction.type} size={22} priority glow />
          </span>
        ) : (
          <ThumbsUp className="w-[18px] h-[18px] pointer-events-none" strokeWidth={1.6} />
        )}
        <span className="pointer-events-none tracking-tight">{activeLabel}</span>
      </button>

      {/* Premium Reaction Picker */}
      {showReactions && (
        <>
          <div className="absolute bottom-full left-0 right-0 h-3" />
          <div
            ref={reactionMenuRef}
            role="menu"
            aria-label={t('reactionGratitude')}
            className="absolute bottom-full left-0 mb-2 z-[9999] select-none"
            style={{
              transform: `translateX(${menuOffset}px)`,
              WebkitTouchCallout: 'none',
              touchAction: 'none',
            }}
            onTouchMove={(e) => e.preventDefault()}
          >
            <div
              className="fun-reaction-bar relative flex gap-0.5 px-1.5 py-1 rounded-[22px]"
            >
              {REACTIONS.map((reaction, index) => {
                const isFocused =
                  hoveredReaction === reaction.type || swipeSelectedReaction === reaction.type;
                const anyFocused = hoveredReaction || swipeSelectedReaction;
                const isNeighbor =
                  !!anyFocused &&
                  !isFocused &&
                  Math.abs(
                    REACTIONS.findIndex((r) => r.type === anyFocused) - index
                  ) === 1;
                return (
                  <button
                    key={reaction.type}
                    ref={(el) => {
                      if (el) reactionButtonRefs.current.set(reaction.type, el);
                    }}
                    type="button"
                    role="menuitem"
                    aria-label={reaction.label}
                    className="fun-reaction-item relative w-10 h-10 flex items-center justify-center rounded-full select-none outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    style={{
                      WebkitTouchCallout: 'none',
                      WebkitUserSelect: 'none',
                      touchAction: 'none',
                      transform: isFocused
                        ? 'scale(1.28) translateY(-10px)'
                        : isNeighbor
                        ? 'scale(1.08) translateY(-2px)'
                        : 'scale(1)',
                      zIndex: isFocused ? 10 : 1,
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleReactionSelect(reaction.type);
                    }}
                    onClick={() => handleReactionSelect(reaction.type)}
                    onMouseEnter={() => setHoveredReaction(reaction.type)}
                    onMouseLeave={() => setHoveredReaction(null)}
                    onFocus={() => setHoveredReaction(reaction.type)}
                    title={reaction.label}
                  >
                    <PremiumEmoji
                      type={reaction.type}
                      size={32}
                      priority={index < 3}
                      glow={isFocused}
                    />

                    {isFocused && (
                      <span className="fun-reaction-tooltip absolute -top-8 left-1/2 -translate-x-1/2 pointer-events-none">
                        {reaction.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
});
