import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * /p/:shareCode → redirect to canonical /:username/posts/:public_id
 *
 * Username-independent: looks up post_id from share_code, then resolves
 * the CURRENT username from profiles. Survives username changes.
 */
const ShareRedirect = () => {
  const { shareCode } = useParams<{ shareCode: string }>();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!shareCode) {
      setNotFound(true);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data: post, error } = await supabase
        .from('posts')
        .select('public_id, user_id, slug')
        .eq('share_code', shareCode)
        .is('deleted_at', null)
        .maybeSingle();

      if (cancelled) return;

      if (error || !post) {
        setNotFound(true);
        return;
      }

      // Resolve current username (so renamed accounts still redirect correctly)
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', post.user_id)
        .maybeSingle();

      if (cancelled) return;

      const username = profile?.username;
      if (username && post.public_id) {
        navigate(`/${username}/posts/${post.public_id}`, { replace: true });
      } else if (username && post.slug) {
        navigate(`/${username}/post/${post.slug}`, { replace: true });
      } else {
        // No username available — fall back to not-found rather than guess.
        setNotFound(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareCode, navigate]);

  if (notFound) {
    return <Navigate to="/not-found" replace />;
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="max-w-2xl mx-auto px-2 sm:px-4 lg:px-8 py-6">
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
};

export default ShareRedirect;
