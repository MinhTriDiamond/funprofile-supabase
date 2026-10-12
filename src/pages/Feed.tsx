import { useEffect, memo, useRef, useCallback, useMemo, useState } from 'react';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { LazyCreatePost } from '@/components/feed/LazyCreatePost';
import { FeedCollapsible } from '@/components/feed/FeedCollapsible';
import { useHomeFeedLayout } from '@/hooks/useHomeFeedLayout';
import { LovehubMarquee } from '@/components/feed/LovehubMarquee';
import { FacebookPostCard } from '@/components/feed/FacebookPostCard';
import { SharedPostCard } from '@/components/feed/SharedPostCard';
import { PendingPostCard } from '@/components/feed/PendingPostCard';
import { isOptimisticGhost } from '@/lib/optimisticFeed';
import { GiftCelebrationGroup } from '@/components/feed/GiftCelebrationGroup';
import { FeedPostViewportGate } from '@/components/feed/FeedPostViewportGate';
import { FacebookLeftSidebar } from '@/components/feed/FacebookLeftSidebar';
import { FacebookRightSidebar } from '@/components/feed/FacebookRightSidebar';
import { StoriesBar } from '@/components/feed/StoriesBar';
import { Skeleton } from '@/components/ui/skeleton';
import { useFeedPosts } from '@/hooks/useFeedPosts';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import ScrollToTopButton from '@/components/common/ScrollToTopButton';
import { PullToRefreshContainer } from '@/components/common/PullToRefreshContainer';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { AccountUpgradeBanner } from '@/components/security/AccountUpgradeBanner';
import { SocialLinkReminderBanner } from '@/components/profile/SocialLinkReminderBanner';
import { DisplayNameReminderBanner } from '@/components/profile/DisplayNameReminderBanner';
import { GiftTransactionToast } from '@/components/feed/GiftTransactionToast';
import { NewUserSocialGuideDialog } from '@/components/onboarding/NewUserSocialGuideDialog';
import { LiveNowStrip } from '@/components/live/LiveNowStrip';


// Lightweight skeleton components
const SidebarSkeleton = memo(() => (
  <div className="space-y-3">
    <div className="fb-card p-4">
      <Skeleton className="h-6 w-32 mb-4" />
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    </div>
  </div>
));
SidebarSkeleton.displayName = 'SidebarSkeleton';

const PostSkeleton = memo(() => (
  <div className="fb-card p-4">
    <div className="flex items-center gap-3 mb-4">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
    <Skeleton className="h-4 w-full mb-2" />
    <Skeleton className="h-4 w-3/4 mb-4" />
    <Skeleton className="h-48 w-full rounded-lg" />
  </div>
));
PostSkeleton.displayName = 'PostSkeleton';

const MemoLeftSidebar = memo(FacebookLeftSidebar);
MemoLeftSidebar.displayName = 'MemoLeftSidebar';

const MemoRightSidebar = memo(FacebookRightSidebar);
MemoRightSidebar.displayName = 'MemoRightSidebar';

const Feed = () => {
  const { userId: currentUserId } = useCurrentUser();
  const { t } = useLanguage();
  const { isCompact, isReadingMode, reducedMotion } = useHomeFeedLayout();
  const [isLovehubHiddenMobile, setIsLovehubHiddenMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('fun:feed:hide-lovehub-mobile');
    if (stored !== null) return stored === 'true';
    return window.matchMedia('(max-width: 767px)').matches;
  });
  const { 
    posts, 
    postStats, 
    isLoading, 
    isGiftLoading,
    isFetchingNextPage, 
    hasNextPage, 
    fetchNextPage, 
    refetch 
  } = useFeedPosts();
  const giftPosts = useMemo(
    () => posts.filter(p => !('_type' in p) && p.post_type === 'gift_celebration'),
    [posts],
  );
  const regularPosts = useMemo(
    () => posts.filter(p => ('_type' in p && p._type === 'shared') || (!('_type' in p) && p.post_type !== 'gift_celebration')),
    [posts],
  );

  // Intersection observer for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const loadNextPage = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    fetchNextPage().finally(() => {
      loadingMoreRef.current = false;
    });
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-app-scroll]');
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadNextPage();
    }, {
      root,
      rootMargin: '900px 0px',
      threshold: 0,
    });

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [loadNextPage]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-app-scroll]');
    if (!root) return;

    let rafId: number | null = null;
    const checkNearBottom = () => {
      rafId = null;
      const distanceToBottom = root.scrollHeight - root.scrollTop - root.clientHeight;
      if (distanceToBottom < 1200) loadNextPage();
    };
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(checkNearBottom);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    checkNearBottom();
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [loadNextPage]);

  const handlePullRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const toggleLovehubMobile = useCallback(() => {
    setIsLovehubHiddenMobile((prev) => {
      const next = !prev;
      localStorage.setItem('fun:feed:hide-lovehub-mobile', String(next));
      return next;
    });
  }, []);

  const renderFeedItem = useCallback((post: any, index: number) => {
    const isGhost = !('_type' in post) && isOptimisticGhost(post);
    return (
      <FeedPostViewportGate
        key={'_type' in post && post._type === 'shared' ? `shared-${post.id}` : post.id}
        priority={index < 4}
        fallbackHeight={'_type' in post && post._type === 'shared' ? 460 : 520}
      >
        {'_type' in post && post._type === 'shared' ? (
          <SharedPostCard
            sharedPost={post}
            currentUserId={currentUserId || ''}
            onPostDeleted={refetch}
            initialStats={post.posts ? postStats[post.posts.id] : undefined}
            disableRealtime
          />
        ) : isGhost ? (
          <PendingPostCard post={post} />
        ) : (
          <FacebookPostCard
            post={post}
            currentUserId={currentUserId || ''}
            onPostDeleted={refetch}
            initialStats={postStats[post.id]}
            disableRealtime
          />
        )}
      </FeedPostViewportGate>
    );
  }, [currentUserId, postStats, refetch]);

  return (
    <div className="min-h-screen overflow-hidden relative">
      {/* Video nền trang chủ */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 hidden h-full w-full object-cover z-0 pointer-events-none md:block"
        src="/videos/hero-bg.mp4"
        preload="none"
      />
      <div className="fixed inset-0 z-0 pointer-events-none" />
      <div className="relative z-[1]">
        <FacebookNavbar />
      
      <main data-app-scroll className="app-main app-pb-nav">
        <PullToRefreshContainer onRefresh={handlePullRefresh}>
          <div className="w-full max-w-screen-2xl mx-auto px-0 sm:px-6 lg:px-2">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 sm:gap-2 md:gap-4 pt-0 pb-2 md:pb-4">
              {/* Left Sidebar - Hidden on mobile/tablet */}
              <aside className="hidden lg:block lg:col-span-3 min-w-0">
                <div className="sticky top-0 max-h-[calc(100dvh-var(--header-h)-var(--safe-top))] overflow-y-auto pr-2 scrollbar-thin">
                  <MemoLeftSidebar />
                </div>
              </aside>

              {/* Main Feed - Full width on mobile */}
              <div className="col-span-1 lg:col-span-6 w-full min-w-0 px-0">
                

                
                {/* Sticky Feed Header: chỉ Composer cố định khi cuộn */}
                <div className="sticky top-0 z-40 -mx-3 px-3 bg-background/95 backdrop-blur-md border-b border-border/40 shadow-sm md:-mx-2 md:px-2">
                  {currentUserId && (
                    <FeedCollapsible collapsed={false} reducedMotion={reducedMotion}>
                      <div className={
                        isCompact
                          ? 'pt-0 pb-1 flex flex-col justify-center'
                          : 'pt-0 pb-2 min-h-[70px] md:min-h-[80px] flex flex-col justify-center'
                      }>
                        <LazyCreatePost onPostCreated={refetch} compact={isCompact} />
                      </div>
                    </FeedCollapsible>
                  )}
                </div>

                {/* LovehubMarquee cuộn theo trang, không cố định */}
                <div className={isLovehubHiddenMobile ? 'hidden md:block' : undefined}>
                  <div className="flex md:hidden justify-end pb-1 pt-1">
                    <button
                      type="button"
                      onClick={toggleLovehubMobile}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-primary shadow-sm active:scale-95"
                      aria-expanded={!isLovehubHiddenMobile}
                      aria-controls="feed-lovehub-marquee"
                    >
                      {isLovehubHiddenMobile ? (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          {t('feedShowLoveHub')}
                        </>
                      ) : (
                        <>
                          <ChevronUp className="h-4 w-4" />
                          Ẩn LoveHub
                        </>
                      )}
                    </button>
                  </div>
                  <div id="feed-lovehub-marquee">
                    <LovehubMarquee />
                  </div>
                </div>



                <FeedCollapsible
                  collapsed={isCompact || isReadingMode}
                  reducedMotion={reducedMotion}
                >
                  <LiveNowStrip />
                </FeedCollapsible>
                <FeedCollapsible
                  collapsed={false}
                  mini={isReadingMode}
                  miniHeight={72}
                  reducedMotion={reducedMotion}
                >
                  <StoriesBar currentUserId={currentUserId || ''} />
                </FeedCollapsible>


                {/* Gift celebrations group */}
                <GiftCelebrationGroup
                  key="gift-group-all"
                  posts={giftPosts}
                  currentUserId={currentUserId || ''}
                  onPostDeleted={refetch}
                  postStats={postStats}
                  isGiftLoading={isGiftLoading}
                />

                {currentUserId && <DisplayNameReminderBanner />}
                {currentUserId && <AccountUpgradeBanner />}
                {currentUserId && <SocialLinkReminderBanner />}

                {!currentUserId && (
                  <div className="fb-card p-4 mb-4 text-center">
                    <p className="text-muted-foreground">{t('loginToPost')}</p>
                  </div>
                )}

                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <PostSkeleton key={i} />)}
                  </div>
                ) : (
                  regularPosts.length === 0 ? (
                    <div className="fb-card p-8 text-center">
                      <p className="text-muted-foreground">{t('noPostsYet')}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {regularPosts.map(renderFeedItem)}

                      <div ref={loadMoreRef} className="py-4">
                        {isFetchingNextPage && (
                          <div className="flex justify-center items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>{t('loadingMorePosts')}</span>
                          </div>
                        )}
                        {hasNextPage && !isFetchingNextPage && (
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={loadNextPage}
                              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-primary shadow-sm active:scale-95"
                            >
                              {t('feedLoadMore')}
                            </button>
                          </div>
                        )}
                        {!hasNextPage && posts.length > 0 && (
                          <div className="text-center text-muted-foreground text-sm py-2">
                            {t('noMorePostsMessage')} 🎉
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Right Sidebar - Hidden on mobile/tablet */}
              <aside className="hidden lg:block lg:col-span-3 min-w-0">
                <div className="sticky top-0 max-h-[calc(100dvh-var(--header-h)-var(--safe-top))] overflow-y-auto pl-2 scrollbar-thin">
                  <MemoRightSidebar />
                </div>
              </aside>

            </div>
          </div>
        </PullToRefreshContainer>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Scroll to top button */}
      <ScrollToTopButton />

      {/* Gift transaction notifications */}
      <GiftTransactionToast />

      {/* New user social guide dialog */}
      <NewUserSocialGuideDialog />
      </div>
    </div>
  );
};

export { Feed };
export default Feed;
