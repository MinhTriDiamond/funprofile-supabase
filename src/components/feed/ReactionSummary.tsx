import { useState, useEffect, useRef } from 'react';
import { ReactionViewerDialog } from './ReactionViewerDialog';
import { useLanguage } from '@/i18n/LanguageContext';
import { PremiumEmoji } from '@/components/ui/PremiumEmoji';
import { REACTION_ASSETS } from '@/lib/reactionAssets';

interface ReactionCount {
  type: string;
  count: number;
}

interface ReactionSummaryProps {
  postId: string;
  reactions: ReactionCount[];
  totalCount: number;
  commentCount: number;
  shareCount: number;
  onCommentClick: () => void;
}

export const ReactionSummary = ({
  postId,
  reactions,
  totalCount,
  commentCount,
  shareCount,
  onCommentClick,
}: ReactionSummaryProps) => {
  const [showViewerDialog, setShowViewerDialog] = useState(false);
  const { t } = useLanguage();
  const prevCountRef = useRef(totalCount);
  const [bumpKey, setBumpKey] = useState(0);

  useEffect(() => {
    if (totalCount !== prevCountRef.current) {
      prevCountRef.current = totalCount;
      setBumpKey((k) => k + 1);
    }
  }, [totalCount]);

  if (totalCount === 0 && commentCount === 0 && shareCount === 0) return null;

  const sortedReactions = [...reactions]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .filter((r) => r.count > 0);

  return (
    <>
      <div className="flex items-center justify-between py-2 text-sm text-muted-foreground">
        <div>
          {totalCount > 0 && (
            <button
              onClick={() => setShowViewerDialog(true)}
              className="flex items-center gap-1.5 group"
              aria-label={`${totalCount} ${t('comments')}`}
            >
              <div className="flex -space-x-1.5">
                {sortedReactions.map((reaction, index) => {
                  const asset = REACTION_ASSETS[reaction.type as keyof typeof REACTION_ASSETS];
                  if (!asset) return null;
                  return (
                    <span
                      key={reaction.type}
                      className="w-[22px] h-[22px] rounded-full flex items-center justify-center bg-card ring-2 ring-card transition-transform group-hover:scale-110"
                      style={{ zIndex: 3 - index }}
                    >
                      <PremiumEmoji type={asset.type} size={18} />
                    </span>
                  );
                })}
              </div>
              <span
                key={bumpKey}
                className="text-[13px] font-medium tabular-nums tracking-tight text-muted-foreground reaction-count-bump group-hover:underline group-hover:decoration-[hsl(var(--gold))]/60 group-hover:underline-offset-2"
              >
                {totalCount}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {commentCount > 0 && (
            <button
              onClick={onCommentClick}
              className="text-[12px] font-medium tabular-nums hover:text-foreground transition-colors"
            >
              {commentCount} {t('comments')}
            </button>
          )}
          {shareCount > 0 && (
            <span className="text-[12px] font-medium tabular-nums hover:text-foreground cursor-pointer transition-colors">
              {shareCount} {t('shares')}
            </span>
          )}
        </div>
      </div>

      <ReactionViewerDialog
        open={showViewerDialog}
        onOpenChange={setShowViewerDialog}
        postId={postId}
        reactions={reactions}
        totalCount={totalCount}
      />
    </>
  );
};
