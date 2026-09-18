import { useNavigate } from 'react-router-dom';
import { Radio, Eye, Users } from 'lucide-react';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useFollowingLiveStatus } from '@/modules/live/hooks/useFollowingLiveStatus';
import { useActiveLiveSessions } from '@/modules/live/useLiveSession';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { LiveAvatarBadge } from '@/components/live/LiveAvatarBadge';

export default function LiveDiscoveryPage() {
  const navigate = useNavigate();
  const dateLocale = useDateLocale();
  const { liveFriends, isLoading: friendsLoading } = useFollowingLiveStatus();
  const { data: allSessions = [], isLoading: allLoading } = useActiveLiveSessions();

  // Filter out sessions already shown in friends section
  const friendSessionIds = new Set(liveFriends.map((f) => f.sessionId));
  const otherSessions = allSessions.filter((s) => !friendSessionIds.has(s.id));

  const isLoading = friendsLoading || allLoading;

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main className="pt-16 max-w-2xl mx-auto px-4 pb-24 lg:pb-8">

        {/* Header */}
        <div className="flex items-center gap-3 py-5">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <Radio className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Live</h1>
            <p className="text-sm text-muted-foreground">Xem bạn bè và mọi người đang phát trực tiếp</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Friends section */}
            {liveFriends.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Bạn bè đang live
                </h2>
                <div className="space-y-3">
                  {liveFriends.map((s) => (
                    <LiveSessionRow
                      key={s.sessionId}
                      sessionId={s.sessionId}
                      title={s.title}
                      viewerCount={s.viewerCount}
                      startedAt={s.startedAt}
                      host={s.host}
                      onWatch={() => navigate(`/live/${s.sessionId}`)}
                      isFriend
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Other live sessions */}
            {otherSessions.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Radio className="w-4 h-4" />
                  Đang diễn ra
                </h2>
                <div className="space-y-3">
                {otherSessions.map((s) => (
                    <LiveSessionRow
                      key={s.id}
                      sessionId={s.id}
                      title={s.title || 'Phát trực tiếp'}
                      viewerCount={s.viewer_count}
                      startedAt={s.started_at}
                      host={{
                        id: s.host_user_id,
                        username: s.host_profile?.username || 'User',
                        avatar_url: s.host_profile?.avatar_url || null,
                      }}
                      onWatch={() => navigate(`/live/${s.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {liveFriends.length === 0 && otherSessions.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Radio className="w-8 h-8 opacity-40" />
                </div>
                <p className="font-medium text-foreground">Không có ai đang live</p>
                <p className="text-sm mt-1">Hãy quay lại sau nhé!</p>
              </div>
            )}
          </>
        )}
      </main>
      <MobileBottomNav />
    </div>
  );
}

interface LiveSessionRowProps {
  sessionId: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  host: { id: string; username: string; avatar_url: string | null };
  onWatch: () => void;
  isFriend?: boolean;
}

function LiveSessionRow({ title, viewerCount, startedAt, host, onWatch, isFriend }: LiveSessionRowProps) {
  const dateLocale = useDateLocale();
  return (
    <Card className="p-4 hover:bg-accent/30 transition-colors cursor-pointer" onClick={onWatch}>
      <div className="flex items-center gap-3">
        <LiveAvatarBadge
          avatarUrl={host.avatar_url}
          username={host.username}
          userId={host.id}
          isLive
          liveSessionId={undefined}
          size="lg"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-semibold text-sm truncate">{host.username}</span>
            {isFriend && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium shrink-0">
                Bạn bè
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{title}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {viewerCount}
            </span>
            <span>·</span>
            <span>{formatDistanceToNow(new Date(startedAt), { addSuffix: true, locale: dateLocale })}</span>
          </div>
        </div>

        <Button size="sm" variant="destructive" className="shrink-0 gap-1.5" onClick={(e) => { e.stopPropagation(); onWatch(); }}>
          <Radio className="w-3.5 h-3.5" />
          Xem
        </Button>
      </div>
    </Card>
  );
}
