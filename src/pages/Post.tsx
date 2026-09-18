import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { FacebookPostCard } from '@/components/feed/FacebookPostCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { SEOHead, buildArticleJsonLd } from '@/components/seo/SEOHead';

interface PostProfileData {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  full_name: string | null;
  public_wallet_address: string | null;
}

interface PostWithProfile {
  id: string;
  public_id: string | null;
  share_code: string | null;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  media_urls: Array<{ url: string; type: 'image' | 'video' }> | null;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  visibility: string | null;
  slug: string | null;
  profiles: PostProfileData;
  reactions: Array<{ id: string; user_id: string; type: string }>;
  comments: Array<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_ID_RE = /^post_\d+$/i;

const Post = () => {
  const params = useParams<{ postId?: string; publicId?: string; username?: string; slug?: string }>();
  const { postId, publicId, username, slug } = params;
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { userId } = useCurrentUser();
  const [post, setPost] = useState<PostWithProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const redirectedRef = useRef<string | null>(null);
  const navigateRef = useRef(navigate);
  const locationPathRef = useRef(location.pathname);
  const loadedKeyRef = useRef<string | null>(null);

  // Giữ ref cập nhật nhưng KHÔNG re-trigger effect khi navigate / pathname đổi.
  useEffect(() => {
    navigateRef.current = navigate;
    locationPathRef.current = location.pathname;
  });

  // Khoá fetch ổn định — chỉ đổi khi param thật sự thay đổi.
  const fetchKey = postId ?? publicId ?? (username && slug ? `${username}/${slug}` : '');

  useEffect(() => {
    let cancelled = false;

    // Nếu đã load đúng bài này rồi thì không set loading lại → tránh flash trắng
    // khi component re-render vì lý do khác (theme, i18n, reaction ở con...).
    if (loadedKeyRef.current !== fetchKey) {
      setLoading(true);
    }

    const selectCols = `
      id, public_id, share_code, content, image_url, video_url, media_urls,
      created_at, updated_at, user_id, visibility, slug,
      profiles:public_profiles!posts_user_id_fkey (username, display_name, avatar_url, full_name, public_wallet_address),
      reactions (id, user_id, type),
      comments (id)
    `;

    const fetchByColumn = async (column: 'id' | 'public_id', value: string) => {
      return supabase
        .from('posts')
        .select(selectCols)
        .eq(column, value)
        .is('deleted_at', null)
        .maybeSingle();
    };

    const run = async () => {
      let row: PostWithProfile | null = null;

      if (publicId) {
        const { data } = await fetchByColumn('public_id', publicId);
        row = (data as unknown as PostWithProfile | null) ?? null;
      } else if (postId) {
        if (UUID_RE.test(postId)) {
          const { data } = await fetchByColumn('id', postId);
          row = (data as unknown as PostWithProfile | null) ?? null;
        } else if (PUBLIC_ID_RE.test(postId)) {
          const { data } = await fetchByColumn('public_id', postId);
          row = (data as unknown as PostWithProfile | null) ?? null;
        }
      } else if (username && slug) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username)
          .maybeSingle();

        if (profile?.id) {
          const { data } = await supabase
            .from('posts')
            .select(selectCols)
            .eq('user_id', profile.id)
            .eq('slug', slug)
            .is('deleted_at', null)
            .maybeSingle();
          row = (data as unknown as PostWithProfile | null) ?? null;

          if (!row) {
            const { data: history } = await supabase
              .from('slug_history')
              .select('new_slug')
              .eq('content_type', 'post')
              .eq('user_id', profile.id)
              .eq('old_slug', slug)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (!cancelled && history?.new_slug) {
              navigateRef.current(`/${username}/post/${history.new_slug}`, { replace: true });
              return;
            }
          }
        } else {
          const { data: usernameHistory } = await supabase
            .from('username_history')
            .select('new_username')
            .eq('old_username', username)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!cancelled && usernameHistory?.new_username) {
            navigateRef.current(`/${usernameHistory.new_username}/post/${slug}`, { replace: true });
            return;
          }
        }
      }

      if (cancelled) return;

      if (!row) {
        setPost(null);
        setLoading(false);
        loadedKeyRef.current = fetchKey;
        return;
      }

      // Canonical redirect — chỉ chạy 1 lần và chỉ khi URL hiện tại chưa canonical.
      const currentUsername = row.profiles?.username;
      const canonicalPath = currentUsername && row.public_id
        ? `/${currentUsername}/posts/${row.public_id}`
        : null;

      if (
        canonicalPath &&
        locationPathRef.current !== canonicalPath &&
        redirectedRef.current !== canonicalPath
      ) {
        redirectedRef.current = canonicalPath;
        navigateRef.current(canonicalPath, { replace: true });
        return;
      }

      setPost(row);
      setLoading(false);
      loadedKeyRef.current = fetchKey;
    };

    run();
    return () => {
      cancelled = true;
    };
    // Chỉ re-fetch khi fetchKey thật sự đổi (postId/publicId/username+slug đổi).
    // Cố ý bỏ navigate/location.pathname khỏi deps để tránh loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  // SEO data — always self-references the canonical URL
  const seoData = useMemo(() => {
    if (!post) return null;
    const authorName = post.profiles?.display_name || post.profiles?.username || 'FUN User';
    const postContent = (post.content || '').slice(0, 155);
    const postUsername = post.profiles?.username;
    const canonicalPath = postUsername && post.public_id
      ? `/${postUsername}/posts/${post.public_id}`
      : postUsername && post.slug
        ? `/${postUsername}/post/${post.slug}`
        : `/post/${post.id}`;
    const firstMediaImage = Array.isArray(post.media_urls)
      ? post.media_urls.find((m) => m.type === 'image')?.url
      : null;
    return {
      title: `${authorName} - Post`,
      description: postContent || `Post by ${authorName} on FUN Profile`,
      canonicalPath,
      image: post.image_url || firstMediaImage || null,
      jsonLd: buildArticleJsonLd({
        title: `Post by ${authorName}`,
        description: postContent,
        url: `https://fun.rich${canonicalPath}`,
        image: post.image_url || firstMediaImage || null,
        authorName,
        datePublished: post.created_at,
      }),
    };
  }, [post]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background overflow-hidden">
        <FacebookNavbar />
        <main data-app-scroll className="app-main app-pb-nav">
          <div className="max-w-2xl mx-auto px-2 sm:px-4 lg:px-8 py-6">
            <div className="bg-card rounded-xl shadow-sm p-4 space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <Skeleton className="w-11 h-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3 rounded" />
                  <Skeleton className="h-3 w-1/4 rounded" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-11/12 rounded" />
                <Skeleton className="h-3.5 w-4/5 rounded" />
                <Skeleton className="h-3.5 w-2/3 rounded" />
              </div>
              <Skeleton className="h-64 w-full rounded-lg" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-9 flex-1 rounded-md" />
                <Skeleton className="h-9 flex-1 rounded-md" />
                <Skeleton className="h-9 flex-1 rounded-md" />
              </div>
            </div>
          </div>
        </main>
        <MobileBottomNav />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background overflow-hidden">
        <FacebookNavbar />
        <main data-app-scroll className="app-main app-pb-nav">
          <div className="max-w-2xl mx-auto px-2 sm:px-4 lg:px-8 py-20">
            <div className="bg-card rounded-xl shadow-sm p-8 sm:p-12 text-center">
              <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-5xl">😕</span>
              </div>
               <h2 className="text-2xl font-bold mb-3">{t('postNotFound')}</h2>
              <p className="text-muted-foreground mb-6">{t('postNotFoundDesc')}</p>
              <Button onClick={() => navigate('/')} className="bg-primary hover:bg-primary/90">
                <Home className="w-4 h-4 mr-2" />
                {t('backToHome')}
              </Button>
            </div>
          </div>
        </main>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {seoData && (
        <SEOHead
          title={seoData.title}
          description={seoData.description}
          canonicalPath={seoData.canonicalPath}
          image={seoData.image}
          ogType="article"
          jsonLd={seoData.jsonLd}
        />
      )}
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="max-w-2xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-4 hover:bg-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('goBack')}
          </Button>

          <div className="animate-fade-in">
            <FacebookPostCard
              post={post}
              currentUserId={userId || ''}
              onPostDeleted={() => navigate('/')}
            />
          </div>

          <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-lg mb-4">{t('relatedPosts')}</h3>
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('featureInDevelopment')}</p>
            </div>
          </div>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
};

export default Post;
