import { useCallback, useMemo } from 'react';
import { FacebookPostCard } from '@/components/feed/FacebookPostCard';
import { SharedPostCard } from '@/components/feed/SharedPostCard';
import { GiftCelebrationCard } from '@/components/feed/GiftCelebrationCard';
import { LazyCreatePost } from '@/components/feed/LazyCreatePost';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Pin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import { useProfilePolling } from '@/hooks/useProfilePolling';
import type { PostStats } from '@/hooks/useFeedPosts';
import type { ProfileData } from '@/hooks/useProfile';

const EMPTY_POST_STATS: PostStats = {
  reactions: [],
  commentCount: 0,
  shareCount: 0,
};

interface ProfilePostsProps {
  profile: ProfileData;
  currentUserId: string;
  showPrivateElements: boolean;
  isOwnProfile: boolean;
  viewAsPublic: boolean;
  displayedPosts: any[];
  hasMorePosts: boolean;
  sortedPostsLength: number;
  timelineLoading: boolean;
  loadingMorePosts: boolean;
  onLoadMorePosts: () => void;
  onSetProfile: (updater: (prev: ProfileData | null) => ProfileData | null) => void;
  buildInitialStats: (post: any) => PostStats | undefined;
  onRefresh: () => void;
}

export const ProfilePosts = ({
  profile,
  currentUserId,
  showPrivateElements,
  isOwnProfile,
  viewAsPublic,
  displayedPosts,
  hasMorePosts,
  sortedPostsLength,
  timelineLoading,
  loadingMorePosts,
  onLoadMorePosts,
  onSetProfile,
  buildInitialStats,
  onRefresh,
}: ProfilePostsProps) => {
  const { t } = useLanguage();

  const postIds = useMemo(() => {
    return displayedPosts
      .filter((item) => item._type === 'original')
      .map((item) => item.id);
  }, [displayedPosts]);

  const polledStats = useProfilePolling(postIds);

  const handlePinPost = useCallback(async (postId: string) => {
    try {
      const { error } = await supabase.from('profiles').update({ pinned_post_id: postId }).eq('id', currentUserId);
      if (error) throw error;
      onSetProfile(prev => prev ? { ...prev, pinned_post_id: postId } : prev);
      toast.success(t('postPinned'));
    } catch {
      toast.error(t('cannotPinPost'));
    }
  }, [currentUserId, onSetProfile, t]);

  const handleUnpinPost = useCallback(async () => {
    try {
      const { error } = await supabase.from('profiles').update({ pinned_post_id: null }).eq('id', currentUserId);
      if (error) throw error;
      onSetProfile(prev => prev ? { ...prev, pinned_post_id: null } : prev);
      toast.success(t('postUnpinned'));
    } catch {
      toast.error(t('cannotUnpinPost'));
    }
  }, [currentUserId, onSetProfile, t]);

  return (
    <div className="space-y-4">
      {showPrivateElements && currentUserId && (
        <LazyCreatePost onPostCreated={onRefresh} />
      )}

      {timelineLoading && displayedPosts.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ) : displayedPosts.length === 0 ? (
        <div className="bg-card/70 rounded-xl shadow-sm border border-border p-8 text-center text-muted-foreground">
          {t('noPostsYet')}
        </div>
      ) : (
        <>
          {displayedPosts.map((item) => {
            const isPinned = item._type === 'original' && item.id === profile?.pinned_post_id;
            const stats = item._type === 'original'
              ? (polledStats[item.id] || buildInitialStats(item) || EMPTY_POST_STATS)
              : undefined;
            const sharedStats = EMPTY_POST_STATS;

            return item._type === 'shared' ? (
              <SharedPostCard
                key={`shared-${item.id}`}
                sharedPost={{
                  ...item,
                  profiles: {
                    username: profile.username,
                    display_name: profile.display_name,
                    avatar_url: profile.avatar_url || null,
                    public_wallet_address: profile.public_wallet_address,
                  },
                }}
                currentUserId={currentUserId}
                onPostDeleted={onRefresh}
                initialStats={sharedStats}
                disableRealtime
              />
            ) : (
              <div key={item.id} className="space-y-0">
                {isPinned && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground px-4 py-2 bg-secondary/50 rounded-t-xl border-b border-border">
                    <Pin className="w-4 h-4 text-primary" /><span className="font-medium">{t('pinnedPost')}</span>
                  </div>
                )}
                {item.post_type === 'gift_celebration' ? (
                  <GiftCelebrationCard post={item} currentUserId={currentUserId} onPostDeleted={onRefresh} initialStats={stats} disableRealtime disableEffects />
                ) : (
                  <FacebookPostCard
                    post={item}
                    currentUserId={currentUserId}
                    onPostDeleted={onRefresh}
                    initialStats={stats}
                    isPinned={isPinned}
                    onPinPost={showPrivateElements ? handlePinPost : undefined}
                    onUnpinPost={showPrivateElements ? handleUnpinPost : undefined}
                    isOwnProfile={isOwnProfile}
                    viewAsPublic={viewAsPublic}
                    disableRealtime
                  />
                )}
              </div>
            );
          })}
          {hasMorePosts && (
            <div className="flex justify-center py-4">
              <Button variant="secondary" onClick={onLoadMorePosts} disabled={loadingMorePosts} className="w-full max-w-md">
                {loadingMorePosts ? 'Dang tai...' : `Xem them (${sortedPostsLength} bai da tai)`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
