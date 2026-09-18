import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface SocialLink {
  platform?: string;
  url?: string;
  label?: string;
}

interface SignupUser {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  social_links: SocialLink[] | null;
}

interface Props {
  date: string;
  endDate?: string;
  periodLabel?: string;
}

const SIMPLE_ICONS = 'https://cdn.simpleicons.org';

const getPlatformLogo = (platform?: string): string => {
  const p = (platform || '').toLowerCase();
  if (p.includes('facebook') || p.includes('fb')) return `${SIMPLE_ICONS}/facebook/1877F2`;
  if (p.includes('youtube') || p.includes('yt')) return `${SIMPLE_ICONS}/youtube/FF0000`;
  if (p.includes('tiktok')) return `${SIMPLE_ICONS}/tiktok/000000`;
  if (p.includes('instagram') || p.includes('ig')) return `${SIMPLE_ICONS}/instagram/E4405F`;
  if (p.includes('twitter') || p.includes('x.com') || p.includes('x ')) return `${SIMPLE_ICONS}/x/000000`;
  if (p.includes('telegram') || p.includes('tg')) return `${SIMPLE_ICONS}/telegram/26A5E4`;
  if (p.includes('zalo')) return '/zalo-logo-v2.png';
  if (p.includes('linkedin')) return `${SIMPLE_ICONS}/linkedin/0A66C2`;
  if (p.includes('github')) return `${SIMPLE_ICONS}/github/181717`;
  if (p.includes('threads')) return `${SIMPLE_ICONS}/threads/000000`;
  if (p.includes('funplay') || p.includes('fun play')) return '/fun-play-logo-36.webp';
  if (p.includes('angel')) return '/angel-ai-logo-36.webp';
  if (p.includes('website') || p.includes('blog')) return `${SIMPLE_ICONS}/googlechrome/4285F4`;
  return `${SIMPLE_ICONS}/link/gray`;
};

const getPlatformName = (link: SocialLink): string => {
  if (link.label) return link.label;
  if (link.platform) return link.platform;
  try {
    if (link.url) return new URL(link.url).hostname.replace('www.', '');
  } catch {}
  return 'Link';
};

export const NewMembersDateDetail = ({ date, endDate, periodLabel }: Props) => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const isRange = endDate && endDate !== date;

  const { data: users, isLoading } = useQuery({
    queryKey: ['signups-by-date', date, endDate],
    queryFn: async (): Promise<SignupUser[]> => {
      if (isRange) {
        const { data, error } = await (supabase.rpc as any)('get_signups_by_range_vn', {
          p_start_date: date,
          p_end_date: endDate,
        });
        if (error) throw error;
        return (data as SignupUser[]) || [];
      }
      const { data, error } = await supabase.rpc('get_signups_by_date_vn', { p_date: date });
      if (error) throw error;
      return (data as SignupUser[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const displayLabel = periodLabel || (() => {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  })();

  const formatTime = (iso: string) => {
    const dt = new Date(iso);
    const vnHour = dt.getUTCHours() + 7;
    const h = vnHour >= 24 ? vnHour - 24 : vnHour;
    const min = String(dt.getUTCMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  };

  const parseSocialLinks = (raw: SocialLink[] | null): SocialLink[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(l => l.url);
    return [];
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="text-center text-[15px] font-semibold mb-2 text-green-800 dark:text-green-300">
        {displayLabel} — {users?.length || 0} {language === 'vi' ? 'thành viên mới' : 'new members'}
      </div>

      {/* Search */}
      <div className="relative mb-2 px-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={language === 'vi' ? 'Tìm theo tên hoặc username...' : 'Search by name or username...'}
          className="pl-9 pr-8 h-9 text-sm"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {(() => {
        const q = searchQuery.toLowerCase().trim();
        const filtered = q
          ? users?.filter(u =>
              (u.full_name || '').toLowerCase().includes(q) ||
              (u.username || '').toLowerCase().includes(q)
            )
          : users;

        if (isLoading) return (
          <div className="space-y-3 p-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        );

        if (!filtered?.length) return (
          <div className="p-8 text-center text-muted-foreground">
            {q
              ? (language === 'vi' ? 'Không tìm thấy thành viên' : 'No members found')
              : (language === 'vi' ? 'Không có thành viên mới' : 'No new members')}
          </div>
        );

        return (
          <div className="space-y-1">
            {filtered.map((user) => {
            const displayName = user.full_name || user.username || 'User';
            const initials = displayName.slice(0, 2).toUpperCase();
            const links = parseSocialLinks(user.social_links);

            return (
              <div key={user.id} className="rounded-lg hover:bg-muted/50 transition-colors p-2.5">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => navigate(user.username ? `/@${user.username}` : `/profile/${user.id}`)}
                    className="shrink-0"
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={user.avatar_url || ''} sizeHint="sm" />
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => navigate(user.username ? `/@${user.username}` : `/profile/${user.id}`)}
                        className="text-left min-w-0"
                      >
                        <div className="text-[15px] font-semibold truncate text-green-800 dark:text-green-300">{displayName}</div>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {links.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={getPlatformName(link)}
                            className="hover:scale-110 transition-transform"
                          >
                            <img src={getPlatformLogo(link.platform)} alt={getPlatformName(link)} className="w-[18px] h-[18px] rounded-sm object-contain" />
                          </a>
                        ))}
                        <span className="text-[13px] text-green-700 dark:text-green-300 tabular-nums ml-1 font-medium">
                          {formatTime(user.created_at)}
                        </span>
                      </div>
                    </div>
                    {user.username && (
                      <button
                        onClick={() => navigate(`/@${user.username}`)}
                        className="text-[13px] text-green-700/70 dark:text-green-300/70 truncate block"
                      >
                        @{user.username}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        );
      })()}
    </div>
  );
};
