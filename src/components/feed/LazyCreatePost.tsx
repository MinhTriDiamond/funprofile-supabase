/**
 * Lightweight placeholder for FacebookCreatePost.
 * The feed composer stays in the compact one-row layout until the real
 * composer is mounted.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ImagePlus, SmilePlus, Video } from 'lucide-react';
import { lazyNamedWithChunkRecovery } from '@/lib/appUpdateRecovery';
import { CreatePostActionButton } from './CreatePostActionButton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/integrations/supabase/client';
import { LiveAvatarBadge } from '@/components/live/LiveAvatarBadge';
import { getProfileLiveState, type ProfileLiveFields } from '@/components/live/getProfileLiveState';
import { useLanguage } from '@/i18n/LanguageContext';
import { getComposerPlaceholder } from './composerPlaceholder';

// FacebookCreatePost.tsx export named `CreatePost` (+ alias `FacebookCreatePost`
// và default). Ưu tiên named export tường minh để không phụ thuộc default —
// tránh tái diễn incident 2026-07-16 "LazyImportMissingDefaultError".
const FacebookCreatePost = lazyNamedWithChunkRecovery(
  () => import('./FacebookCreatePost'),
  'CreatePost',
);

interface LazyCreatePostProps {
  onPostCreated?: () => void;
  /** Compact mode: chỉ hiện input bar 1 dòng + avatar, ẩn 3 action button. */
  compact?: boolean;
}

type InitialComposerAction = 'compose' | 'live' | 'media' | 'feeling';

let preloadStarted = false;
const preloadComposer = () => {
  if (preloadStarted) return;
  preloadStarted = true;
  import('./FacebookCreatePost').catch(() => {
    preloadStarted = false;
  });
};

export const LazyCreatePost = ({ onPostCreated, compact = false }: LazyCreatePostProps) => {
  const [mounted, setMounted] = useState(false);
  const [initialAction, setInitialAction] = useState<InitialComposerAction>('compose');

  useEffect(() => {
    if (mounted) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const idle = w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const id = idle(() => preloadComposer());
    return () => {
      if (typeof id === 'number') window.clearTimeout(id);
    };
  }, [mounted]);

  const open = useCallback((action: InitialComposerAction = 'compose') => {
    setInitialAction(action);
    preloadComposer();
    setMounted(true);
  }, []);

  if (mounted) {
    return (
      <Suspense fallback={<PlaceholderShell onOpen={() => {}} loading compact={compact} />}>
        <FacebookCreatePost onPostCreated={onPostCreated} initialAction={initialAction} />
      </Suspense>
    );
  }

  return <PlaceholderShell onOpen={open} compact={compact} />;
};

interface PlaceholderShellProps {
  onOpen: (action?: InitialComposerAction) => void;
  loading?: boolean;
  compact?: boolean;
}

const PlaceholderShell = ({ onOpen, loading, compact = false }: PlaceholderShellProps) => {
  const { userId } = useCurrentUser();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<(ProfileLiveFields & {
    username?: string | null;
    display_name?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
  }) | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, username, display_name, full_name, avatar_url, is_live, current_live_session_id, live_started_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile(data || null);
      });

    const channel = supabase
      .channel(`composer-profile-live-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          if (!cancelled) setProfile((payload.new as typeof profile) || null);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const liveState = getProfileLiveState(profile);

  return (
    <div className={compact ? 'fb-card px-2.5 py-1.5 sm:px-3' : 'fb-card px-2.5 py-2 sm:px-3'}>
      <div className={compact ? 'flex items-center gap-2' : 'flex items-center gap-2 md:gap-3'}>
        {!compact && (
          <LiveAvatarBadge
            avatarUrl={profile?.avatar_url}
            username={profile?.username}
            userId={userId}
            isLive={liveState.isLive}
            liveSessionId={liveState.liveSessionId}
            size="md"
          />
        )}
        <button
          type="button"
          onClick={() => onOpen('compose')}
          onMouseEnter={preloadComposer}
          onFocus={preloadComposer}
          disabled={loading}
          className={
            compact
              ? 'flex-1 truncate rounded-full bg-secondary px-4 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/80'
              : 'flex-1 truncate rounded-full bg-secondary px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/80'
          }
          aria-label={t('lcpCreatePostAria')}
        >
          {loading ? t('loadingShort') : getComposerPlaceholder(profile, t)}
        </button>
        {!compact && (
          <div className="flex shrink-0 items-center gap-1">
            <CreatePostActionButton
              onClick={() => onOpen('live')}
              onMouseEnter={preloadComposer}
              icon={<Video />}
              label="Live/Video"
              colorClass="text-red-500"
              variant="iconOnly"
            />
            <CreatePostActionButton
              onClick={() => onOpen('media')}
              onMouseEnter={preloadComposer}
              icon={<ImagePlus />}
              label={t('lcpPhoto')}
              colorClass="text-emerald-500"
              variant="iconOnly"
            />
            <CreatePostActionButton
              onClick={() => onOpen('feeling')}
              onMouseEnter={preloadComposer}
              icon={<SmilePlus />}
              label={t('lcpFeeling')}
              colorClass="text-amber-500"
              variant="iconOnly"
            />
          </div>
        )}
      </div>
    </div>
  );
};
