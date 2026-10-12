import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LazyImage } from '@/components/ui/LazyImage';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Story {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  preview_url: string | null;
  preview_type: 'image' | 'video' | null;
  live_session_id?: string | null;
}

interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface StoriesBarProps {
  currentUserId?: string;
}

export const StoriesBar = memo(({ currentUserId }: StoriesBarProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [stories, setStories] = useState<Story[]>([]);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      if (!currentUserId) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', currentUserId)
        .single();
      setCurrentUser(profile);
    };

    const fetchStories = async () => {
      // Lấy danh sách user đang phát trực tiếp
      const { data: liveSessions } = await supabase
        .from('live_sessions')
        .select('id, host_user_id, started_at, thumbnail_url, public_profiles!live_sessions_host_user_id_fkey(id, username, avatar_url)')
        .in('status', ['live', 'reconnecting'])
        .order('started_at', { ascending: false })
        .limit(20);

      const liveMap = new Map<string, { sessionId: string; thumbnail: string | null }>();
      const liveStories: Story[] = [];
      (liveSessions || []).forEach((s: any) => {
        if (!s.public_profiles || liveMap.has(s.host_user_id)) return;
        liveMap.set(s.host_user_id, { sessionId: s.id, thumbnail: s.thumbnail_url || null });
        liveStories.push({
          id: `live-${s.id}`,
          user_id: s.host_user_id,
          username: s.public_profiles.username,
          avatar_url: s.public_profiles.avatar_url,
          preview_url: s.thumbnail_url || s.public_profiles.avatar_url || null,
          preview_type: 'image',
          live_session_id: s.id,
        });
      });

      const { data: recentPosts } = await supabase
        .from('posts')
        .select('id, user_id, image_url, video_url, media_urls, public_profiles!posts_user_id_fkey(id, username, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(40);

      const uniqueUsers = new Map<string, Story>();
      (recentPosts || []).forEach((post: any) => {
        if (!post.public_profiles || uniqueUsers.has(post.user_id) || liveMap.has(post.user_id)) return;

        let preview_url: string | null = null;
        let preview_type: 'image' | 'video' | null = null;

        const media = Array.isArray(post.media_urls) ? post.media_urls : [];
        const firstMedia = media.find((m: any) => m?.url);
        if (firstMedia) {
          preview_url = firstMedia.url;
          preview_type = firstMedia.type === 'video' ? 'video' : 'image';
        } else if (post.image_url) {
          preview_url = post.image_url;
          preview_type = 'image';
        } else if (post.video_url) {
          preview_url = post.video_url;
          preview_type = 'video';
        }

        if (!preview_url) return;

        uniqueUsers.set(post.user_id, {
          id: post.id,
          user_id: post.user_id,
          username: post.public_profiles.username,
          avatar_url: post.public_profiles.avatar_url,
          preview_url,
          preview_type,
        });
      });
      setStories([...liveStories, ...Array.from(uniqueUsers.values())].slice(0, 12));
    };

    fetchCurrentUser();
    fetchStories();

    // Realtime cập nhật khi có user bắt đầu/dừng live
    const channel = supabase
      .channel('stories-bar-live-status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_sessions' },
        () => fetchStories(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateArrows, stories.length, currentUser]);

  const scrollByAmount = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="fb-card p-4 mb-4">
      <div className="relative group">
        <button
          type="button"
          aria-label={t('stbScrollLeft')}
          onClick={() => scrollByAmount(-1)}
          className={`absolute left-1 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/90 backdrop-blur border border-border/60 shadow-md hover:bg-background transition flex items-center justify-center ${
            canLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </button>
        <button
          type="button"
          aria-label={t('stbScrollRight')}
          onClick={() => scrollByAmount(1)}
          className={`absolute right-1 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/90 backdrop-blur border border-border/60 shadow-md hover:bg-background transition flex items-center justify-center ${
            canRight ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <ChevronRight className="h-4 w-4 text-foreground" />
        </button>
        <div ref={scrollerRef} onScroll={updateArrows} className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {/* Create Story Card */}
        {currentUser && (
          <div className="flex-shrink-0 w-28 h-[173px] rounded-xl overflow-hidden relative cursor-pointer group transition-transform hover:scale-[1.02]">
            <div className="absolute inset-0">
              {currentUser.avatar_url ? (
                <LazyImage
                  src={currentUser.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                  priority
                  transformPreset="thumbnail"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/40 to-secondary" />
              )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
            <div className="absolute bottom-0 left-0 right-0 bg-card pt-7 pb-2 px-2 text-center">
              <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center border-4 border-card shadow-md">
                  <Plus className="w-5 h-5 text-primary-foreground" />
                </div>
              </div>
              <p className="text-xs font-semibold mt-1">{t('stbCreateStory')}</p>
            </div>
          </div>
        )}

        {/* Story Cards */}
        {stories.map((story) => (
          <div
            key={story.id}
            onClick={() =>
              story.live_session_id
                ? navigate(`/live/${story.live_session_id}`)
                : navigate(`/post/${story.id}`)
            }
            className="flex-shrink-0 w-28 h-[173px] rounded-xl overflow-hidden relative cursor-pointer group transition-transform hover:scale-[1.02]"
          >
            {/* Preview media */}
            <div className="absolute inset-0 bg-secondary">
              {story.preview_type === 'video' && story.preview_url ? (
                <video
                  src={story.preview_url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : story.preview_url ? (
                <LazyImage
                  src={story.preview_url}
                  alt={`${t('stbStoryOfPrefix')}${story.username}`}
                  className="w-full h-full object-cover"
                  transformPreset="thumbnail"
                />
              ) : null}
            </div>

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70 group-hover:from-black/20 transition-colors" />

            {/* Avatar with gradient ring (đỏ khi đang LIVE) */}
            <div className="absolute top-2.5 left-2.5">
              <div
                className={`p-[2px] rounded-full ${
                  story.live_session_id
                    ? 'bg-red-600 animate-pulse'
                    : 'bg-gradient-to-tr from-pink-500 via-fuchsia-500 to-blue-500'
                }`}
              >
                <div className="p-[2px] rounded-full bg-card">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={story.avatar_url || ''} alt={`${t('stbAvatarOfPrefix')}${story.username}`} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {story.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </div>

            {/* Nhãn LIVE đỏ kiểu Facebook */}
            {story.live_session_id && (
              <div className="absolute top-2.5 right-2.5 z-10">
                <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-md tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </span>
              </div>
            )}

            {/* Username */}
            <div className="absolute bottom-2 left-2 right-2">
              <p className="text-xs font-semibold text-white truncate drop-shadow-md">
                {story.username}
              </p>
            </div>
          </div>
        ))}

        {stories.length === 0 && !currentUser && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {t('stbLoginToView')}
          </div>
        )}
        </div>
      </div>
    </div>
  );
});

StoriesBar.displayName = 'StoriesBar';
