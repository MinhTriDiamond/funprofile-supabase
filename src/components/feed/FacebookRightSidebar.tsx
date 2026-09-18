import { useEffect, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLanguage } from '@/i18n/LanguageContext';
import { Video, Search, MoreHorizontal } from 'lucide-react';
import { AppHonorBoard } from './AppHonorBoard';
import { TopRanking } from './TopRanking';
import { LiveAvatarBadge } from '@/components/live/LiveAvatarBadge';
import { getProfileLiveState } from '@/components/live/getProfileLiveState';

interface OnlineContact {
  id: string;
  username: string;
  avatar_url: string | null;
  is_live?: boolean | null;
  current_live_session_id?: string | null;
  live_started_at?: string | null;
}

export const RightSidebar = memo(() => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { userId } = useCurrentUser();
  const [onlineContacts, setOnlineContacts] = useState<OnlineContact[]>([]);

  useEffect(() => {
    if (!userId) return;
    const fetchContacts = async () => {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq('status', 'accepted')
        .limit(10);

      if (friendships && friendships.length > 0) {
        const friendIds = friendships.map(f => f.user_id === userId ? f.friend_id : f.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, is_live, current_live_session_id, live_started_at')
          .in('id', friendIds);
        setOnlineContacts(profiles || []);
      }
    };
    fetchContacts();
  }, [userId]);

  const sponsoredLogoUrl = '/fun-profile-logo-128.webp';

  return (
    <div className="space-y-4">
      <div className="min-h-[80px] flex flex-col"><AppHonorBoard /></div>
      <TopRanking />

      <div className="bg-card/70 rounded-lg border border-border p-4">
        <h3 className="font-semibold text-muted-foreground mb-3">{t('sponsored')}</h3>
        <div className="flex gap-3 cursor-pointer hover:bg-secondary rounded-lg p-2 -m-2 transition-colors">
          <img src={sponsoredLogoUrl} alt="Ad" width={128} height={128} className="w-32 h-32 rounded-lg object-cover" loading="lazy" />
          <div>
            <p className="font-semibold text-sm">FUN Profile - Web3 Social Network</p>
            <p className="text-xs text-muted-foreground">funprofile.io</p>
          </div>
        </div>
      </div>

      {onlineContacts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-2">
            <h3 className="font-semibold text-muted-foreground">{t('contacts')}</h3>
            <div className="flex gap-2">
              <button className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center" aria-label="Video call"><Video className="w-4 h-4" /></button>
              <button className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center" aria-label={t('search')}><Search className="w-4 h-4" /></button>
              <button className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center" aria-label="More options"><MoreHorizontal className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="space-y-1">
            {onlineContacts.map((contact) => {
              const live = getProfileLiveState(contact);
              return (
                <button
                  key={contact.id}
                  onClick={() => live.isLive && live.liveSessionId ? navigate(`/live/${live.liveSessionId}`) : navigate(`/profile/${contact.id}`)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition-colors"
                >
                  <LiveAvatarBadge
                    avatarUrl={contact.avatar_url}
                    username={contact.username}
                    userId={contact.id}
                    isLive={live.isLive}
                    liveSessionId={live.liveSessionId}
                    size="sm"
                  />
                  <span className="font-medium text-sm">{contact.username}</span>
                  {live.isLive && (
                    <span className="ml-auto rounded-sm bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                      LIVE
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card/70 rounded-lg border border-border p-4">
        <h3 className="font-semibold text-muted-foreground mb-3">{t('birthdays')}</h3>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">🎂</div>
          <p className="text-sm">{t('noBirthdaysToday')}</p>
        </div>
      </div>
    </div>
  );
});

RightSidebar.displayName = 'RightSidebar';

/** @deprecated Use RightSidebar instead */
export const FacebookRightSidebar = RightSidebar;
