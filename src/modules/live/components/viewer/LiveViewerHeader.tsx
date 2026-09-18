import { BadgeCheck, Radio, Share2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FollowButton } from '@/components/reels/FollowButton';
import { useUserIdentityBadge } from '@/hooks/useUserIdentityBadge';
import { LiveSharePanel } from '../LiveSharePanel';
import type { LiveSession } from '../../types';
import { isFreshLiveSession, isReconnectingLiveSession } from '../../utils/liveSessionFreshness';

interface LiveViewerHeaderProps {
  session: LiveSession;
  sessionId: string;
  currentUserId: string | null;
}

export function LiveViewerHeader({ session, sessionId, currentUserId }: LiveViewerHeaderProps) {
  const hostId = session.host_user_id;
  const hostName = session.host_profile?.full_name || session.host_profile?.username || 'Host';
  const hostInitial = hostName.charAt(0).toUpperCase();
  const isOwnLive = !!currentUserId && currentUserId === hostId;
  const { data: identityBadge } = useUserIdentityBadge(hostId);
  const isVerified = !!identityBadge?.did_id && ['verified', 'active'].includes(String(identityBadge.did_status || '').toLowerCase());
  const liveFreshness = {
    status: session.status,
    host_connection_status: session.host_connection_status,
    last_seen_at: session.last_seen_at,
    last_host_heartbeat_at: session.last_host_heartbeat_at,
    ended_at: session.ended_at,
  };
  const isLiveNow = isFreshLiveSession(liveFreshness);
  const isReconnecting = !isLiveNow && isReconnectingLiveSession(liveFreshness);

  return (
    <div className="rounded-2xl border border-gold/20 bg-card/95 p-3 shadow-sm md:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-14 w-14 border-2 border-gold/50 shadow-md md:h-16 md:w-16">
              <AvatarImage src={session.host_profile?.avatar_url || ''} />
              <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
                {hostInitial || 'H'}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-card bg-emerald-500" />
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h2 className="truncate text-base font-bold uppercase tracking-normal md:text-xl">{hostName}</h2>
              {isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Verified host" />}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
              </span>
              <span>{isLiveNow ? 'Đang phát trực tiếp' : isReconnecting ? 'Đang kết nối lại...' : 'Livestream đã kết thúc'}</span>
            </div>
            <h1 className="mt-1 line-clamp-2 text-lg font-extrabold leading-tight text-foreground md:text-2xl">
              {session.title || 'Live Stream'}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge className={`gap-1 rounded-full px-3 py-1 text-white ${isLiveNow ? 'bg-red-600 shadow-[0_0_18px_rgba(220,38,38,0.35)]' : isReconnecting ? 'bg-amber-500' : 'bg-muted-foreground'}`}>
            <Radio className="h-3.5 w-3.5" />
            {isLiveNow ? 'LIVE' : isReconnecting ? 'RECONNECTING' : 'ENDED'}
          </Badge>
          {!isOwnLive && hostId && (
            <div className="[&>button]:!border-primary [&>button]:!text-primary [&>button:hover]:!bg-primary/10 [&>span]:!border-primary/30 [&>span]:!text-primary">
              <FollowButton userId={hostId} />
            </div>
          )}
          <LiveSharePanel sessionId={sessionId} username={session.host_profile?.username || undefined} />
          <Button variant="outline" size="sm" className="gap-1.5 sm:hidden">
            <Share2 className="h-4 w-4" />
            Chia sẻ
          </Button>
        </div>
      </div>
    </div>
  );
}
