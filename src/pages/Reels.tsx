import { Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { useSlugResolver } from '@/hooks/useSlugResolver';
import { lazyWithChunkRecovery } from '@/lib/appUpdateRecovery';

const ReelsFeed = lazyWithChunkRecovery(() => import('@/components/reels/ReelsFeed'), 'ReelsFeed');

const ReelsLoader = () => (
  <div className="flex items-center justify-center h-screen bg-black">
    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const Reels = () => {
  const { reelId, username, slug } = useParams<{ reelId?: string; username?: string; slug?: string }>();

  const { resolvedId } = useSlugResolver({
    contentType: 'reel',
    table: 'reels',
    userIdColumn: 'user_id',
    directId: reelId,
    username,
    slug,
    urlPrefix: 'video',
  });

  return (
    <div className="min-h-screen bg-black">
      <div className="hidden md:block">
        <FacebookNavbar />
      </div>
      <main
        data-app-scroll
        className="fixed inset-x-0 top-0 bottom-0 overflow-hidden bg-black md:top-[calc(var(--header-h)+var(--safe-top))]"
        style={{ paddingBottom: 'calc(var(--mbn-h) + var(--safe-bottom))' }}
      >
        <Suspense fallback={<ReelsLoader />}>
          <ReelsFeed initialReelId={resolvedId} />
        </Suspense>
      </main>
      <MobileBottomNav />
    </div>
  );
};

export default Reels;
