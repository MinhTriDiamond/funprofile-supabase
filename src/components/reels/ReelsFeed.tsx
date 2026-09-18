import { Component, useState, useRef, useEffect, useCallback, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReels, useReelComments } from '@/hooks/useReels';
import { lazyNamedWithChunkRecovery } from '@/lib/appUpdateRecovery';
import { OptionalWeb3Provider } from '@/components/providers/OptionalWeb3Provider';
import ReelPlayer from './ReelPlayer';
import ReelInfo from './ReelInfo';
import ReelComments from './ReelComments';
import { CreateReelDialog } from './CreateReelDialog';
import { ShareReelDialog } from './ShareReelDialog';
import { DoubleTapLike } from './DoubleTapLike';

// Lazy load — chỉ tải wagmi/Web3 khi user mở dialog tặng quà
const UnifiedGiftSendDialog = lazyNamedWithChunkRecovery(
  () => import('@/components/donations/UnifiedGiftSendDialog'),
  'UnifiedGiftSendDialog',
);

class ReelGiftBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[ReelsFeed] Gift dialog unavailable.', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-x-4 bottom-20 z-[100] mx-auto max-w-sm rounded-xl border border-primary/20 bg-card p-4 text-sm text-card-foreground shadow-lg">
          Tính năng ví đang cần cập nhật, vui lòng tải lại trang.
        </div>
      );
    }

    return this.props.children;
  }
}
import { Camera, Heart, MessageCircle, Share2, Bookmark, Plus, Volume2, VolumeX, HandCoins } from 'lucide-react';
import { useReelBookmarks } from '@/hooks/useReelBookmarks';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ReelsFeedProps {
  initialReelId?: string;
}

const ReelsFeed = ({ initialReelId }: ReelsFeedProps) => {
  const {
    reels,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    toggleLike,
    recordView,
    currentUser,
  } = useReels(12);
  const { toggleBookmark } = useReelBookmarks();
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [showDoubleTapHeart, setShowDoubleTapHeart] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const viewRecorded = useRef<Set<string>>(new Set());
  const deepLinkScrolled = useRef(false);
  const loadingMore = useRef(false);

  const currentReel = reels[currentIndex];
  
  const { data: currentReelComments = [] } = useReelComments(currentReel?.id || null);
  const realCommentCount = currentReelComments.length;

  useEffect(() => {
    if (searchParams.get('create') === '1' && currentUser) {
      setCreateOpen(true);
    }
  }, [currentUser, searchParams]);

  const handleCreateOpenChange = useCallback((open: boolean) => {
    setCreateOpen(open);
    if (!open && searchParams.get('create') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('create');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Deep link: scroll to specific reel when loaded
  useEffect(() => {
    if (!initialReelId || deepLinkScrolled.current || reels.length === 0 || !containerRef.current) return;
    const targetIndex = reels.findIndex(r => r.id === initialReelId);
    if (targetIndex < 0) {
      if (hasNextPage && !isFetchingNextPage && !loadingMore.current) {
        loadingMore.current = true;
        fetchNextPage().finally(() => {
          loadingMore.current = false;
        });
      }
      return;
    }
    if (targetIndex >= 0) {
      deepLinkScrolled.current = true;
      setCurrentIndex(targetIndex);
      requestAnimationFrame(() => {
        containerRef.current?.scrollTo({
          top: targetIndex * containerRef.current!.clientHeight,
          behavior: 'instant',
        });
      });
    }
  }, [fetchNextPage, hasNextPage, initialReelId, isFetchingNextPage, reels]);

  // Record view when reel changes
  useEffect(() => {
    if (currentReel && !viewRecorded.current.has(currentReel.id)) {
      viewRecorded.current.add(currentReel.id);
      recordView(currentReel.id);
    }
  }, [currentReel?.id, recordView]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const index = Math.round(container.scrollTop / container.clientHeight);
    if (index !== currentIndex && index >= 0 && index < reels.length) {
      setCurrentIndex(index);
    }
    if (
      index >= reels.length - 3 &&
      hasNextPage &&
      !isFetchingNextPage &&
      !loadingMore.current
    ) {
      loadingMore.current = true;
      fetchNextPage().finally(() => {
        loadingMore.current = false;
      });
    }
  }, [currentIndex, fetchNextPage, hasNextPage, isFetchingNextPage, reels.length]);

  useEffect(() => {
    if (
      currentIndex >= reels.length - 3 &&
      hasNextPage &&
      !isFetchingNextPage &&
      !loadingMore.current
    ) {
      loadingMore.current = true;
      fetchNextPage().finally(() => {
        loadingMore.current = false;
      });
    }
  }, [currentIndex, fetchNextPage, hasNextPage, isFetchingNextPage, reels.length]);

  // Double tap to like
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (currentReel && !currentReel.is_liked && currentUser) {
        toggleLike.mutate({ reelId: currentReel.id, isLiked: false });
        setShowDoubleTapHeart(true);
        setTimeout(() => setShowDoubleTapHeart(false), 1000);
      }
    }
    lastTap.current = now;
  }, [currentReel, currentUser, toggleLike]);

  const handleLike = () => {
    if (!currentUser) { toast.error(t('pleaseLoginToReact')); return; }
    if (currentReel) toggleLike.mutate({ reelId: currentReel.id, isLiked: !!currentReel.is_liked });
  };

  const handleBookmark = () => {
    if (!currentUser) { toast.error(t('pleaseLoginToReact')); return; }
    if (currentReel) toggleBookmark.mutate({ reelId: currentReel.id, isBookmarked: !!currentReel.is_bookmarked, userId: currentUser.id });
  };

  const handleGift = () => {
    if (!currentUser) { toast.error(t('pleaseLoginToReact')); return; }
    setGiftOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-white gap-4">
        <p className="text-lg">{t('noReelsYet')}</p>
        {currentUser && (
          <button onClick={() => setCreateOpen(true)} className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium flex items-center gap-2">
            <Plus className="w-5 h-5" /> {t('createReel')}
          </button>
        )}
        <CreateReelDialog open={createOpen} onOpenChange={handleCreateOpenChange} />
      </div>
    );
  }

  const giftRecipient = currentReel?.profiles ? {
    id: currentReel.profiles.id,
    username: currentReel.profiles.username || '',
    displayName: currentReel.profiles.full_name || null,
    walletAddress: currentReel.profiles.wallet_address || null,
    btcAddress: currentReel.profiles.btc_address || null,
    avatarUrl: currentReel.profiles.avatar_url,
  } : null;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="relative h-full w-full bg-black">
        <div className="pointer-events-none absolute left-4 right-4 top-3 z-30 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white drop-shadow-lg">Reels</h1>
          {currentUser && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="pointer-events-auto h-11 w-11 rounded-full bg-white/15 text-white backdrop-blur-md flex items-center justify-center shadow-lg active:scale-95 transition"
                  aria-label="Tạo Reel"
                >
                  <Camera className="w-6 h-6" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>Tạo Reel</p></TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Reels Container */}
        <div
          ref={containerRef}
          className="h-full w-full overflow-y-scroll snap-y snap-mandatory overscroll-contain touch-pan-y scrollbar-hide"
          onScroll={handleScroll}
          onClick={handleDoubleTap}
        >
          {reels.map((reel, index) => (
            <div key={reel.id} data-reel-id={reel.id} className="h-full w-full snap-start snap-always relative flex items-center justify-center">
              <ReelPlayer
                videoUrl={reel.video_url}
                isActive={index === currentIndex}
                isMuted={isMuted}
                preload={index === currentIndex || index === currentIndex + 1 ? 'metadata' : 'none'}
              />
              {index === currentIndex && showDoubleTapHeart && <DoubleTapLike />}
              <ReelInfo reel={reel} />
              {isFetchingNextPage && index === reels.length - 1 && (
                <div className="absolute bottom-[calc(var(--mbn-h)+var(--safe-bottom)+1rem)] left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-xs font-medium text-white backdrop-blur">
                  Đang tải thêm...
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right side action buttons */}
        {currentReel && (
          <div className="absolute right-3 bottom-[calc(var(--mbn-h)+var(--safe-bottom)+5rem)] flex flex-col items-center gap-4 z-20">
            {/* Like */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleLike} className="flex flex-col items-center gap-1">
                  <div className={`w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center ${currentReel.is_liked ? 'text-red-500' : 'text-white'}`}>
                    <Heart className={`w-6 h-6 ${currentReel.is_liked ? 'fill-current' : ''}`} />
                  </div>
                  <span className="text-white text-xs font-medium">{currentReel.like_count}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>Thích</p></TooltipContent>
            </Tooltip>

            {/* Comment */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-1">
                  <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <span className="text-white text-xs font-medium">{realCommentCount}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>Bình luận</p></TooltipContent>
            </Tooltip>

            {/* Share */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => setShareOpen(true)} className="flex flex-col items-center gap-1">
                  <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white">
                    <Share2 className="w-6 h-6" />
                  </div>
                  <span className="text-white text-xs font-medium">{currentReel.share_count}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>Chia sẻ</p></TooltipContent>
            </Tooltip>

            {/* Gift */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleGift} className="flex flex-col items-center gap-1">
                  <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-amber-400">
                    <HandCoins className="w-6 h-6" />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>Tặng quà</p></TooltipContent>
            </Tooltip>

            {/* Bookmark */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleBookmark} className="flex flex-col items-center gap-1">
                  <div className={`w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center ${currentReel.is_bookmarked ? 'text-yellow-400' : 'text-white'}`}>
                    <Bookmark className={`w-6 h-6 ${currentReel.is_bookmarked ? 'fill-current' : ''}`} />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>Lưu</p></TooltipContent>
            </Tooltip>

            {/* Mute toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => setIsMuted(!isMuted)} className="flex flex-col items-center gap-1">
                  <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white">
                    {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>{isMuted ? 'Bật tiếng' : 'Tắt tiếng'}</p></TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Legacy create button kept disabled; header camera handles creation. */}
        {currentUser && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCreateOpen(true)}
                className="hidden"
              >
                <Plus className="w-6 h-6" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>Tạo Reel</p></TooltipContent>
          </Tooltip>
        )}

        {/* Dialogs */}
        {currentReel && (
          <>
            <ReelComments
              reelId={currentReel.id}
              open={commentsOpen}
              onOpenChange={setCommentsOpen}
            />
            <ShareReelDialog
              reelId={currentReel.id}
              reelSlug={currentReel.slug}
              reelUsername={currentReel.profiles?.username}
              open={shareOpen}
              onOpenChange={setShareOpen}
            />
            {giftRecipient && giftOpen && (
              <ReelGiftBoundary>
                <Suspense fallback={null}>
                  <OptionalWeb3Provider>
                    <UnifiedGiftSendDialog
                      isOpen={giftOpen}
                      onClose={() => setGiftOpen(false)}
                      mode="post"
                      presetRecipient={giftRecipient}
                    />
                  </OptionalWeb3Provider>
                </Suspense>
              </ReelGiftBoundary>
            )}
          </>
        )}
        <CreateReelDialog open={createOpen} onOpenChange={handleCreateOpenChange} />
      </div>
    </TooltipProvider>
  );
};

export default ReelsFeed;
