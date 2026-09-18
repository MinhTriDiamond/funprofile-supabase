import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useDateLocale } from '@/hooks/useDateLocale';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatDistanceToNow } from 'date-fns';
import { Globe, Lock, Repeat2, Users } from 'lucide-react';
import { FacebookPostCard } from './FacebookPostCard';
import type { PostStats, SharedPostData } from './types';

interface SharedPostCardProps {
  sharedPost: SharedPostData;
  currentUserId: string;
  onPostDeleted: () => void;
  initialStats?: PostStats;
  disableRealtime?: boolean;
}

export const SharedPostCard = memo(function SharedPostCard({
  sharedPost,
  currentUserId,
  onPostDeleted,
  initialStats,
  disableRealtime = false,
}: SharedPostCardProps) {
  const navigate = useNavigate();
  const dateLocale = useDateLocale();
  const { t } = useLanguage();
  const sharer = sharedPost.profiles;
  const original = sharedPost.posts;
  const sharerName = sharer?.display_name || sharer?.username || 'FUN Profile';
  const originalName = original?.profiles?.display_name || original?.profiles?.username;

  return (
    <div className="space-y-2">
      <div className="fb-card px-3 py-3 sm:px-4">
        <div className="flex items-start gap-3">
          <Avatar
            className="h-10 w-10 cursor-pointer ring-2 ring-primary/15"
            onClick={() => navigate(`/profile/${sharedPost.user_id}`)}
          >
            <AvatarImage src={sharer?.avatar_url || ''} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {sharer?.username?.[0]?.toUpperCase() || 'F'}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1 text-sm leading-5">
              <button
                type="button"
                className="font-semibold hover:underline"
                onClick={() => navigate(`/profile/${sharedPost.user_id}`)}
              >
                {sharerName}
              </button>
              <span className="text-muted-foreground">{t('sharedPostAction')}</span>
              {originalName && <span className="text-muted-foreground">{t('ofUser')} {originalName}</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Repeat2 className="h-3.5 w-3.5" />
              <span>{formatDistanceToNow(new Date(sharedPost.created_at), { addSuffix: true, locale: dateLocale })}</span>
              <span>·</span>
              {sharedPost.visibility === 'private' ? (
                <Lock className="h-3 w-3" />
              ) : sharedPost.visibility === 'friends' ? (
                <Users className="h-3 w-3" />
              ) : (
                <Globe className="h-3 w-3" />
              )}
            </div>
          </div>
        </div>

        {sharedPost.caption && (
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-6 text-foreground">
            {sharedPost.caption}
          </p>
        )}
      </div>

      {original ? (
        <div className="pl-3 sm:pl-6">
          <FacebookPostCard
            post={original}
            currentUserId={currentUserId}
            onPostDeleted={onPostDeleted}
            initialStats={initialStats}
            disableRealtime={disableRealtime}
          />
        </div>
      ) : (
        <div className="fb-card border-dashed p-5 text-center text-sm text-muted-foreground">
          {t('originalPostUnavailable')}
        </div>
      )}
    </div>
  );
});
