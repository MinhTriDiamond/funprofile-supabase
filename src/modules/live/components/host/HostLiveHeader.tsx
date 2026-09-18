import { BadgeCheck, Radio } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUserIdentityBadge } from '@/hooks/useUserIdentityBadge';
import type { LiveSession } from '../../types';
import type { LiveDurationLimitState } from '../../hooks/useLiveDurationLimit';
import type { HostLiveUiState, HostRecordingDetails } from './hostLiveTypes';
import { HostLiveStatsBar } from './HostLiveStatsBar';

interface HostLiveHeaderProps {
  session: LiveSession;
  sessionId: string;
  uiState: HostLiveUiState;
  liveDuration: string;
  durationLimit: LiveDurationLimitState;
  viewerCount: number;
  reactionCount: number;
  recording: HostRecordingDetails;
}

export function HostLiveHeader({
  session,
  uiState,
  liveDuration,
  durationLimit,
  viewerCount,
  reactionCount,
  recording,
}: HostLiveHeaderProps) {
  const hostName = session.host_profile?.full_name || session.host_profile?.username || 'Host';
  const hostInitial = hostName.charAt(0).toUpperCase();
  const { data: identityBadge } = useUserIdentityBadge(session.host_user_id);
  const isVerified = !!identityBadge?.did_id && ['verified', 'active'].includes(String(identityBadge.did_status || '').toLowerCase());

  return (
    <div className="rounded-[26px] border border-gold/20 bg-white/88 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-12 w-12 border-2 border-gold/60 shadow-md">
              <AvatarImage src={session.host_profile?.avatar_url || ''} />
              <AvatarFallback className="bg-primary/10 text-base font-black text-primary">{hostInitial || 'H'}</AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 shadow">
              <Radio className="h-2.5 w-2.5 text-white" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-black uppercase tracking-wide text-muted-foreground">{hostName}</h2>
              {isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Verified host" />}
            </div>
            <h1 className="mt-0.5 line-clamp-1 text-xl font-black leading-tight text-foreground">
              {session.title || 'Đang LIVE trên FUN Profile'}
            </h1>
          </div>
        </div>

        <HostLiveStatsBar
          uiState={uiState}
          liveDuration={liveDuration}
          durationLimit={durationLimit}
          viewerCount={viewerCount}
          reactionCount={reactionCount}
          recording={recording}
        />
      </div>
    </div>
  );
}
