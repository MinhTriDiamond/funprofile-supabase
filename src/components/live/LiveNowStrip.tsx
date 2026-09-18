import { useNavigate } from 'react-router-dom';
import { Eye, Radio } from 'lucide-react';
import { useActiveLiveSessions } from '@/modules/live/useLiveSession';
import { LiveAvatarBadge } from './LiveAvatarBadge';

export function LiveNowStrip() {
  const navigate = useNavigate();
  const { data: sessions = [], isLoading } = useActiveLiveSessions();
  const activeSessions = sessions.filter((session) =>
    ['live', 'reconnecting'].includes(String(session.status || '')) && !session.ended_at,
  );

  if (isLoading || activeSessions.length === 0) return null;

  return (
    <section className="fb-card mb-3 px-3 py-3" aria-label="Dang phat truc tiep">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-red-600">
          <Radio className="h-4 w-4 fill-red-600" />
          Dang phat truc tiep
        </h2>
        <button
          type="button"
          onClick={() => navigate('/live')}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Xem tat ca
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {activeSessions.map((session) => {
          const hostName = session.host_profile?.full_name
            || session.host_profile?.username
            || 'FUN user';
          const reconnecting = session.status === 'reconnecting';
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => navigate(`/live/${session.id}`)}
              className="flex min-w-[168px] max-w-[210px] shrink-0 items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-left transition-colors hover:bg-red-500/10 active:scale-[0.98]"
            >
              <LiveAvatarBadge
                avatarUrl={session.host_profile?.avatar_url}
                username={session.host_profile?.username || hostName}
                userId={session.host_user_id}
                isLive
                liveSessionId={session.id}
                size="lg"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">
                  {hostName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {reconnecting ? 'Dang ket noi lai...' : (session.title || 'Dang phat truc tiep')}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-red-600">
                  <Eye className="h-3 w-3" />
                  {Number(session.viewer_count) || 0} xem
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
