import { useEffect, useState } from 'react';
import { Eye, Heart, MessageCircle, MessageSquareOff, MessagesSquare, TrendingUp } from 'lucide-react';
import { HostLiveChatPanel } from './HostLiveChatPanel';
import { HostControlDock } from './HostControlDock';
import { HostLiveTopBar } from './HostLiveTopBar';
import { LiveChatOverlay } from './LiveChatOverlay';
import { LiveEndSummaryCard } from './LiveEndSummaryCard';
import { ReplayProcessingStatus } from './ReplayProcessingStatus';
import { WebcamPreviewPlayer } from './WebcamPreviewPlayer';
import { MobileWebcamHostStage } from './MobileWebcamHostStage';
import type { HostLiveCommonProps } from './hostLiveTypes';

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 1023px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

function CompactAnalyticsRow({
  currentViewers,
  peakViewers,
  reactions,
  comments,
}: {
  currentViewers: number;
  peakViewers: number;
  reactions: number;
  comments: number;
}) {
  const items = [
    { label: 'Đang xem', value: currentViewers, icon: Eye, tone: 'text-emerald-700' },
    { label: 'Bình luận', value: comments, icon: MessageCircle, tone: 'text-primary' },
    { label: 'Tương tác', value: reactions, icon: Heart, tone: 'text-rose-600' },
    { label: 'Đỉnh điểm', value: peakViewers, icon: TrendingUp, tone: 'text-amber-700' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gold/15 bg-white/80 px-3 py-2 shadow-sm backdrop-blur">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1">
            <Icon className={`h-3.5 w-3.5 ${item.tone}`} />
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{item.label}</span>
            <span className="text-sm font-black tabular-nums">{item.value.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

export function WebcamHostLivePage(props: HostLiveCommonProps) {
  const isMobile = useIsMobileViewport();

  if (isMobile) {
    return <MobileWebcamHostStage {...props} />;
  }

  const {
    session,
    sessionId,
    uiState,
    liveDuration,
    durationLimit,
    viewers,
    messages,
    messagesLoading,
    reactions,
    reactionCount,
    recording,
    isJoined,
    isEnding,
    statusText,
    liveHealth,
    networkQuality,
    previewStats,
    setLocalContainerRef,
    onViewPost,
    onRequestEnd,
  } = props;

  const peakViewers = Math.max(session.viewer_count || 0, viewers.length);
  const [chatOverlayOn, setChatOverlayOn] = useState(false);
  const showSummary = uiState === 'ending' || uiState === 'processing_replay' || uiState === 'replay_ready' || uiState === 'failed';

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-emerald-50/25 to-gold/10 px-4 pb-8 pt-16 md:px-6">
      <div className="mx-auto grid max-w-[1540px] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-3">
          <HostLiveTopBar
            session={session}
            uiState={uiState}
            liveDuration={liveDuration}
            durationLimit={durationLimit}
            viewerCount={viewers.length}
            reactionCount={reactionCount}
            recording={recording}
            liveHealth={liveHealth}
            networkQuality={networkQuality}
            previewStats={previewStats}
            statusText={statusText}
            hasPost={!!session.post_id}
            onViewPost={onViewPost}
            onRequestEnd={onRequestEnd}
            isEnding={isEnding}
          />

          {!showSummary && <ReplayProcessingStatus uiState={uiState} recording={recording} />}

          {durationLimit.warningLevel === 'urgent' && session.status === 'live' && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-800 shadow-sm">
              Livestream sẽ tự động kết thúc sau {Math.ceil((durationLimit.remainingSeconds || 0) / 60)} phút để đảm bảo chất lượng hệ thống.
            </div>
          )}

          {showSummary ? (
            <LiveEndSummaryCard
              uiState={uiState}
              liveDuration={liveDuration}
              peakViewers={peakViewers}
              reactionCount={reactionCount}
              commentCount={messages.length}
              hasPost={!!session.post_id}
              postId={session.post_id}
              onViewPost={onViewPost}
              onGoHome={() => { window.location.href = '/'; }}
            />
          ) : (
            <div className="relative">
              <WebcamPreviewPlayer
                setLocalContainerRef={setLocalContainerRef}
                isJoined={isJoined}
                statusText={statusText}
                uiState={uiState}
                reactions={reactions}
                liveDuration={liveDuration}
                viewerCount={viewers.length}
                reactionCount={reactionCount}
              />
              {chatOverlayOn && (
                <div className="pointer-events-none absolute inset-x-4 bottom-16 z-20 max-w-md">
                  <LiveChatOverlay messages={messages} />
                </div>
              )}
              <button
                type="button"
                onClick={() => setChatOverlayOn((v) => !v)}
                className="absolute right-4 bottom-4 z-30 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-md transition hover:bg-black/70"
                aria-label={chatOverlayOn ? 'Ẩn chat trên video' : 'Hiện chat trên video'}
                title={chatOverlayOn ? 'Ẩn chat trên video' : 'Hiện chat trên video'}
              >
                {chatOverlayOn ? <MessageSquareOff className="h-3.5 w-3.5" /> : <MessagesSquare className="h-3.5 w-3.5" />}
                {chatOverlayOn ? 'Ẩn chat' : 'Chat overlay'}
              </button>
            </div>
          )}

          {!showSummary && <HostControlDock {...props} />}

          <CompactAnalyticsRow
            currentViewers={viewers.length}
            peakViewers={peakViewers}
            reactions={reactionCount}
            comments={messages.length}
          />
        </section>

        <HostLiveChatPanel
          session={session}
          sessionId={sessionId}
          viewers={viewers}
          messages={messages}
          messagesLoading={messagesLoading}
          reactions={reactions}
          onSendMessage={props.onSendMessage}
        />
      </div>
    </main>
  );
}
