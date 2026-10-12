/**
 * PendingPostCard — hiển thị bài viết "ghost" trong lúc create-post đang chạy nền.
 * Giao diện tối giản, không cho tương tác (like/comment/share), có chip "Đang đăng…".
 */
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { FeedPost } from '@/hooks/useFeedPosts';

interface PendingPostCardProps {
  post: FeedPost;
}

export function PendingPostCard({ post }: PendingPostCardProps) {
  const { t } = useLanguage();
  const displayName = post.profiles?.display_name || post.profiles?.username || t('youLabel');
  const media = (post.media_urls || []).slice(0, 4);

  return (
    <article
      className="fb-card animate-in fade-in slide-in-from-top-2 duration-300 opacity-90"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <Avatar className="h-10 w-10 shrink-0">
          {post.profiles?.avatar_url ? (
            <AvatarImage src={post.profiles.avatar_url} alt={displayName} />
          ) : (
            <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('ppcPosting')}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">{t('justNow')} · {t(visibilityLabelKey(post.visibility) as any)}</div>
        </div>
      </div>

      {post.content ? (
        <div className="whitespace-pre-wrap break-words px-3 pb-2 text-sm text-foreground sm:px-4">
          {post.content}
        </div>
      ) : null}

      {media.length > 0 ? (
        <div
          className={
            media.length === 1
              ? 'grid grid-cols-1 gap-0.5'
              : media.length === 2
                ? 'grid grid-cols-2 gap-0.5'
                : 'grid grid-cols-2 gap-0.5'
          }
        >
          {media.map((m, idx) => (
            <div key={idx} className="relative aspect-square overflow-hidden bg-muted">
              {m.type === 'video' ? (
                <video src={m.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
              ) : (
                <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
              <div className="pointer-events-none absolute inset-0 bg-background/10" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="border-t border-border/60 px-3 py-2 text-center text-xs text-muted-foreground sm:px-4">
        {t('ppcReadySoon')}
      </div>
    </article>
  );
}

function visibilityLabelKey(v: string | undefined) {
  switch (v) {
    case 'friends':
      return 'privacyFriends';
    case 'private':
      return 'privacyOnlyMe';
    default:
      return 'privacyPublic';
  }
}
