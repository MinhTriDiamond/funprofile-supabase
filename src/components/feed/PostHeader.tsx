import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/i18n/LanguageContext';
import { useDateLocale } from '@/hooks/useDateLocale';
import { preloadProfilePage } from '@/lib/profilePreload';
import { formatDistanceToNow } from 'date-fns';
import {
  MoreHorizontal, Globe, Trash2, Pencil, Link2, Bookmark, Pin, PinOff, Users, Lock, Copy, RadioTower,
} from 'lucide-react';
import type { PostData } from './types';
import { isFreshLiveSession, isReconnectingLiveSession } from '@/modules/live/utils/liveSessionFreshness';
import { LiveAvatarBadge } from '@/components/live/LiveAvatarBadge';
import { getProfileLiveState } from '@/components/live/getProfileLiveState';

interface PostHeaderProps {
  post: PostData;
  currentUserId: string;
  isPinned: boolean;
  canShowPinOption: boolean;
  isDeleting: boolean;
  onCopyLink: () => void;
  onCopyContent?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPinPost?: (postId: string) => void;
  onUnpinPost?: () => void;
}

export const PostHeader = memo(function PostHeader({
  post, currentUserId, isPinned, canShowPinOption, isDeleting,
  onCopyLink, onCopyContent, onEdit, onDelete, onPinPost, onUnpinPost,
}: PostHeaderProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const dateLocale = useDateLocale();
  const metadata = post.metadata as {
    live_mode?: string;
    live_session_id?: string;
    live_status?: string;
    status?: string;
    host_connection_status?: string | null;
    last_seen_at?: string | null;
    last_host_heartbeat_at?: string | null;
    ended_at?: string | null;
  } | null | undefined;
  const isLivePost = post.post_type === 'live' || post.post_type === 'live_replay' || !!metadata?.live_session_id;
  const liveFreshness = {
    status: metadata?.status || metadata?.live_status,
    live_status: metadata?.live_status,
    host_connection_status: metadata?.host_connection_status,
    last_seen_at: metadata?.last_seen_at,
    last_host_heartbeat_at: metadata?.last_host_heartbeat_at,
    ended_at: metadata?.ended_at,
  };
  const isLiveNow = isLivePost && post.post_type !== 'live_replay' && isFreshLiveSession(liveFreshness);
  const isLiveReconnecting = isLivePost && post.post_type !== 'live_replay' && !isLiveNow && isReconnectingLiveSession(liveFreshness);
  const isLiveEnded = isLivePost && (metadata?.live_status === 'ended' || post.post_type === 'live_replay');
  const profileLive = getProfileLiveState(post.profiles);
  const headerLiveSessionId = profileLive.liveSessionId || metadata?.live_session_id || null;
  const showLiveAvatar = profileLive.isLive || isLiveNow || isLiveReconnecting;
  const liveActionText = isLiveNow
    ? t('pohLiveNow')
    : isLiveReconnecting
      ? t('pohLiveReconnecting')
      : isLiveEnded
        ? t('pohLiveEnded')
        : null;
  const authorName = post.profiles?.display_name || post.profiles?.username;
  const profilePath = post.profiles?.username && post.profiles.username !== 'unknown'
    ? `/${encodeURIComponent(post.profiles.username)}`
    : `/profile/${post.user_id}`;
  const warmProfileRoute = () => {
    preloadProfilePage().catch(() => undefined);
  };
  const goToProfile = () => navigate(profilePath);

  return (
    <div className="flex items-start justify-between p-4">
      <div className="flex items-center gap-3">
        <LiveAvatarBadge
          avatarUrl={post.profiles?.avatar_url}
          username={post.profiles?.username}
          userId={post.user_id}
          isLive={showLiveAvatar}
          liveSessionId={headerLiveSessionId}
          size="md"
          className="ring-2 ring-primary/20"
          onMouseEnter={warmProfileRoute}
          onFocus={warmProfileRoute}
          onTouchStart={warmProfileRoute}
          onClick={showLiveAvatar && headerLiveSessionId ? () => navigate(`/live/${headerLiveSessionId}`) : goToProfile}
          ariaLabel={showLiveAvatar ? `${authorName || 'User'} ${t('pohLiveNowShort')}` : authorName || 'Profile'}
        />
        <div>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm leading-5">
            <h3
              className="font-semibold cursor-pointer hover:underline"
              onMouseEnter={warmProfileRoute}
              onFocus={warmProfileRoute}
              onTouchStart={warmProfileRoute}
              onClick={goToProfile}
            >
              {authorName}
            </h3>
            {liveActionText && (
              <span className="text-muted-foreground">{liveActionText}</span>
            )}
            {isLiveNow && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-sm bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
            )}
            {isLiveReconnecting && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-sm bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                Reconnecting
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: dateLocale })}
            </span>
            <span>·</span>
            {post.visibility === 'private' ? (
              <Lock className="w-3 h-3" />
            ) : post.visibility === 'friends' ? (
              <Users className="w-3 h-3" />
            ) : (
              <Globe className="w-3 h-3" />
            )}
          </div>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center transition-colors">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem className="cursor-pointer gap-3">
            <Bookmark className="w-5 h-5" />
            {t('savePost')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCopyLink} className="cursor-pointer gap-3">
            <Link2 className="w-5 h-5" />
            {t('copyLink')}
          </DropdownMenuItem>
          {onCopyContent && (
            <DropdownMenuItem onClick={onCopyContent} className="cursor-pointer gap-3">
              <Copy className="w-5 h-5" />
              {t('pohCopyContent')}
            </DropdownMenuItem>
          )}
          {canShowPinOption && (
            isPinned ? (
              <DropdownMenuItem onClick={onUnpinPost} className="cursor-pointer gap-3">
                <PinOff className="w-5 h-5" />
                {t('unpinPost')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onPinPost?.(post.id)} className="cursor-pointer gap-3">
                <Pin className="w-5 h-5" />
                {t('pinPost')}
              </DropdownMenuItem>
            )
          )}
          {post.user_id === currentUserId && (
            <>
              <DropdownMenuItem onClick={onEdit} className="cursor-pointer gap-3">
                <Pencil className="w-5 h-5" />
                {t('editPost')}
              </DropdownMenuItem>
              {(() => {
                const sessionId = metadata?.live_session_id;
                if (metadata?.live_mode !== 'rtmp_obs' || !sessionId) return null;
                return (
                  <DropdownMenuItem
                    onClick={() => navigate(`/live/obs/${sessionId}`)}
                    className="cursor-pointer gap-3"
                  >
                    <RadioTower className={`w-5 h-5 ${isLiveNow ? 'text-red-500' : ''}`} />
                    {isLiveNow ? t('pohEnterLiveProducer') : t('pohViewLiveProducer')}
                  </DropdownMenuItem>
                );
              })()}
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); onDelete(); }}
                disabled={isDeleting}
                className="cursor-pointer text-destructive gap-3"
              >
                <Trash2 className="w-5 h-5" />
                {isDeleting ? t('deleting') : t('deletePost')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
