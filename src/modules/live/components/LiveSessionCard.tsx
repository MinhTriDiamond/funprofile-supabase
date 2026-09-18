import { useNavigate } from 'react-router-dom';
import { Video, Eye, Radio } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { useLanguage } from '@/i18n/LanguageContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { LiveSession } from '../types';

interface LiveSessionCardProps {
  session: LiveSession;
}

export function LiveSessionCard({ session }: LiveSessionCardProps) {
  const navigate = useNavigate();
  const dateLocale = useDateLocale();
  const { t } = useLanguage();
  const hostName = session.host_profile?.full_name || session.host_profile?.username || 'User';
  const avatar = session.host_profile?.avatar_url || '';
  const isLive = session.status === 'live';

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-10 w-10">
            <AvatarImage src={avatar} alt={hostName} />
            <AvatarFallback>{hostName[0]?.toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-semibold truncate">{hostName}</div>
            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(session.started_at), { addSuffix: true, locale: dateLocale })}
            </div>
          </div>
        </div>
        <Badge variant={isLive ? 'destructive' : 'secondary'} className="gap-1">
          <Radio className="h-3.5 w-3.5" />
          {isLive ? 'LIVE' : t('liveEnded')}
        </Badge>
      </div>

      <div className="mt-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Video className="h-4 w-4 text-red-500" />
          {session.title || 'Phát trực tiếp trên FUN Profile'}
        </div>
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
          <Eye className="h-3.5 w-3.5" />
          {session.viewer_count || 0} người xem
        </div>
      </div>

      <div className="mt-3">
        <Button
          className="w-full"
          variant={isLive ? 'default' : 'outline'}
          onClick={() => navigate(`/live/${session.id}`)}
        >
          {isLive ? 'Xem' : 'Xem lại trạng thái'}
        </Button>
      </div>
    </div>
  );
}
