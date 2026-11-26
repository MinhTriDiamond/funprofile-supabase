import { useState } from 'react';
import { Eye, Heart, MessageCircle, MessageSquareOff, MessagesSquare, TrendingUp } from 'lucide-react';
import { HostLiveChatPanel } from './HostLiveChatPanel';
import { HostControlDock } from './HostControlDock';
import { HostLiveTopBar } from './HostLiveTopBar';
import { LiveChatOverlay } from './LiveChatOverlay';
import { LiveEndSummaryCard } from './LiveEndSummaryCard';
import { ReplayProcessingStatus } from './ReplayProcessingStatus';
import { WebcamPreviewPlayer } from './WebcamPreviewPlayer';
import { MobileWebcamHostStage } from './MobileWebcamHostStage';
import { useDesktopLiveViewport } from '../../hooks/useDesktopLiveViewport';
import type { HostLiveCommonProps } from './hostLiveTypes';

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
    { label: 'Đang xem', value: currentViewers, icon: Eye, tone: 'text-primary' },
    { label: 'Bình luận', value: comments, icon: MessageCircle, tone: 'text-primary' },
    { label: 'Tương tác', value: reactions, icon: Heart, tone: 'text-reaction-love' },
    { label: 'Đỉnh điểm', value: peakViewers, icon: TrendingUp, tone: 'text-primary' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-sm backdrop-blur">
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
  const desktop = useDesktopLiveViewport();
  const [chatOverlayOn, setChatOverlayOn] = useState(false);

  if (!desktop) {
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
  } = props;

  const peakViewers = Math.max(session.viewer_count || 0, viewers.length);
  const showSummary = uiState === 'ending' || uiState === 'processing_replay' || uiState === 'replay_ready' || uiState === 'failed';

  return (
    <main data-testid="desktop-webcam-host" className="fixed inset-x-0 bottom-0 top-[var(--header-h)] grid grid-rows-[auto_minmax(0,1fr)] gap-4 bg-background p-4">

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
        isEnding={isEnding}
      />

      <div className="grid min-h-0 grid-cols-[220px_minmax(0,1fr)_280px] gap-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <aside aria-label="Điều khiển buổi live" className="min-h-0 space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-4">
          <div><h2 className="font-bold">Bảng điều khiển</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Điều chỉnh thiết bị và quản lý buổi phát trực tiếp.</p></div>
          {!showSummary && <HostControlDock {...props} />}
          <ReplayProcessingStatus uiState={uiState} recording={recording} />
        </aside>
        <section aria-label="Xem trước và số liệu live" className="min-h-0 min-w-0 space-y-4 overflow-y-auto">
          <div><h2 className="font-bold">Xem trước buổi live</h2><p className="mt-1 text-xs text-muted-foreground">Webcam của bạn · Hình ảnh được giữ đúng tỉ lệ</p></div>

          {durationLimit.warningLevel === 'urgent' && session.status === 'live' && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive shadow-sm">
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
                className="absolute right-4 bottom-4 z-30 inline-flex items-center gap-1.5 rounded-full bg-media/80 px-3 py-2 text-xs font-bold text-media-foreground shadow-lg backdrop-blur-md transition hover:bg-media"
                aria-label={chatOverlayOn ? 'Ẩn chat trên video' : 'Hiện chat trên video'}
                title={chatOverlayOn ? 'Ẩn chat trên video' : 'Hiện chat trên video'}
              >
                {chatOverlayOn ? <MessageSquareOff className="h-3.5 w-3.5" /> : <MessagesSquare className="h-3.5 w-3.5" />}
                {chatOverlayOn ? 'Ẩn chat' : 'Chat overlay'}
              </button>
            </div>
          )}

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
