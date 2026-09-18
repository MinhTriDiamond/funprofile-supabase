import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { MessageCircle, RefreshCw, Share2, Square } from 'lucide-react';
import { LiveChatPanel } from '@/modules/live/components/LiveChatPanel';
import { LiveSharePanel } from '@/modules/live/components/LiveSharePanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LiveViewer } from '@/modules/live/hooks/useLivePresence';
import type { LiveDurationLimitState } from '../../hooks/useLiveDurationLimit';
import { AdvancedRtmpSettings } from './AdvancedRtmpSettings';
import { LivePreviewPlayer } from './LivePreviewPlayer';
import { LiveReactionsPanel } from './LiveReactionsPanel';
import { LiveStatusBar } from './LiveStatusBar';
import { LiveStreamHealthPanel } from './LiveStreamHealthPanel';
import { LiveViewerStats } from './LiveViewerStats';
import { ReplayProcessingStatus } from './ReplayProcessingStatus';

interface LiveControlRoomProps {
  sessionId?: string;
  liveTitle?: string;
  status?: string | null;
  startedAt?: string | null;
  durationLimit?: LiveDurationLimitState;
  endReason?: string | null;
  archiveError?: string | null;
  statusCheckError?: string | null;
  sourceConnected: boolean;
  inputConnected: boolean;
  previewReady?: boolean | null;
  connectionStatus?: string | null;
  liveInputStatus?: string | null;
  signalStatus?: string | null;
  signalLostAt?: string | null;
  reconnectDeadlineAt?: string | null;
  autoEndReason?: string | null;
  reconnectCount?: number | null;
  viewers: LiveViewer[];
  previewProps: React.ComponentProps<typeof LivePreviewPlayer>;
  canEndLive: boolean;
  ending: boolean;
  rtmpsUrl?: string | null;
  streamKey?: string | null;
  persistentStream: boolean;
  creating?: boolean;
  resetting: boolean;
  livePostId?: string | null;
  postId?: string | null;
  onRequestEnd: () => void;
  onViewPost: () => void;
  onReloadPreview: () => void;
  onCopy: (value: string, label: string) => void;
  onResetKey: () => void;
  onChangeStreamMode: (checked: boolean) => void;
}

const REPLAY_STATUSES = new Set(['ended', 'processing', 'processing_replay', 'archiving', 'archived', 'posted', 'failed', 'replay_temp_ready']);

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const remainder = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function LiveControlRoom({
  sessionId,
  liveTitle,
  status,
  startedAt,
  durationLimit,
  endReason,
  archiveError,
  statusCheckError,
  sourceConnected,
  inputConnected,
  previewReady,
  connectionStatus,
  liveInputStatus,
  signalStatus,
  signalLostAt,
  reconnectDeadlineAt,
  autoEndReason,
  reconnectCount,
  viewers,
  previewProps,
  canEndLive,
  ending,
  rtmpsUrl,
  streamKey,
  persistentStream,
  creating,
  resetting,
  livePostId,
  postId,
  onRequestEnd,
  onViewPost,
  onReloadPreview,
  onCopy,
  onResetKey,
  onChangeStreamMode,
}: LiveControlRoomProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isReplayState = !!status && REPLAY_STATUSES.has(status);
  const showLivePanels = status === 'live' || status === 'disconnect_grace' || status === 'reconnecting';
  const isReconnecting = status === 'reconnecting';
  const reconnectCountdown = useMemo(() => {
    if (!isReconnecting) return null;
    const deadline = reconnectDeadlineAt ? Date.parse(reconnectDeadlineAt) : NaN;
    if (Number.isFinite(deadline)) {
      return Math.max(0, Math.ceil((deadline - now) / 1000));
    }
    const lostAt = signalLostAt ? Date.parse(signalLostAt) : NaN;
    if (Number.isFinite(lostAt)) {
      return Math.max(0, 60 - Math.floor((now - lostAt) / 1000));
    }
    return 60;
  }, [isReconnecting, now, reconnectDeadlineAt, signalLostAt]);
  const canViewPost = !!(livePostId || postId);

  const sidePanels = (
    <div className="space-y-3">
      <LiveViewerStats viewers={viewers} />
      {sessionId && <LiveReactionsPanel sessionId={sessionId} />}
      {sessionId && showLivePanels && (
        <LiveChatPanel
          sessionId={sessionId}
          isHost
          liveTitle={liveTitle}
          viewers={viewers}
          className="h-[420px] lg:h-[calc(100vh-330px)] lg:min-h-[420px]"
        />
      )}
      {!showLivePanels && (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Chat sẽ tạm dừng sau khi livestream kết thúc.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="space-y-4">
          {showLivePanels && (
            <LiveStatusBar
              status={status}
              startedAt={startedAt}
              durationLimit={durationLimit}
              viewerCount={viewers.length}
              sourceConnected={sourceConnected}
              inputConnected={inputConnected}
              previewReady={previewReady}
              connectionStatus={connectionStatus}
              signalStatus={signalStatus}
            />
          )}

          <LivePreviewPlayer
            {...previewProps}
            waitingTitle={isReconnecting ? 'Mất tín hiệu từ OBS, đang chờ kết nối lại…' : (status === 'disconnect_grace' ? 'Mất tín hiệu, đang thử kết nối lại…' : previewProps.waitingTitle)}
            waitingDescription={isReconnecting ? 'Vui lòng kiểm tra OBS, mạng internet, Server URL và Stream Key.' : (status === 'disconnect_grace' ? 'Livestream vẫn đang mở trong thời gian chờ nguồn phát quay lại.' : previewProps.waitingDescription)}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {previewProps.canShowPreview && (
                <Button variant="outline" size="sm" onClick={onReloadPreview}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tải lại preview
                </Button>
              )}
              {canViewPost && (
                <Button variant="secondary" size="sm" onClick={onViewPost}>
                  Xem bài live trên feed
                </Button>
              )}
              {sessionId && showLivePanels && (
                <LiveSharePanel sessionId={sessionId} />
              )}
              <Button variant="outline" size="sm" disabled>
                <Share2 className="h-4 w-4 mr-2" />
                Gifts/Shares
              </Button>
            </div>
            <Button variant="destructive" onClick={onRequestEnd} disabled={ending || !canEndLive}>
              <Square className="h-4 w-4" />
              Kết thúc live
            </Button>
          </div>

          {isReconnecting && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
              <div className="font-semibold">Mất tín hiệu từ OBS. Đang chờ OBS kết nối lại...</div>
              <div>Thời gian còn lại: {formatCountdown(reconnectCountdown ?? 60)}</div>
              <div>Vui lòng kiểm tra OBS, mạng internet, Server URL và Stream Key.</div>
              {autoEndReason && <div className="text-xs">Lý do hiện tại: {autoEndReason}</div>}
            </div>
          )}

          {durationLimit?.warningLevel === 'urgent' && showLivePanels && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">
              Livestream sẽ tự động kết thúc sau {Math.ceil((durationLimit.remainingSeconds || 0) / 60)} phút để đảm bảo chất lượng hệ thống.
            </div>
          )}

          <LiveStreamHealthPanel
            status={status}
            sourceConnected={sourceConnected}
            inputConnected={inputConnected}
            previewReady={previewReady}
            connectionStatus={connectionStatus}
            liveInputStatus={liveInputStatus}
            signalStatus={signalStatus}
            reconnectCount={reconnectCount}
            statusCheckError={statusCheckError}
            archiveError={archiveError}
          />

          {isReplayState && (
            <ReplayProcessingStatus
              status={status}
              endReason={endReason}
              archiveError={archiveError}
              onViewPost={canViewPost ? onViewPost : undefined}
            />
          )}

          <AdvancedRtmpSettings
            rtmpsUrl={rtmpsUrl}
            streamKey={streamKey}
            persistentStream={persistentStream}
            creating={creating}
            sourceConnected={sourceConnected}
            isLive={status === 'live' || status === 'disconnect_grace' || status === 'reconnecting'}
            resetting={resetting}
            onCopy={onCopy}
            onResetKey={onResetKey}
            onChangeStreamMode={onChangeStreamMode}
          />
        </section>

        <aside className="hidden lg:block">{sidePanels}</aside>
      </div>

      <div className="lg:hidden">
        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="chat">
              <MessageCircle className="h-4 w-4 mr-1" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
            <TabsTrigger value="react">Reactions</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="mt-3">
            {sessionId && showLivePanels ? (
              <LiveChatPanel sessionId={sessionId} isHost liveTitle={liveTitle} viewers={viewers} className="h-[420px]" />
            ) : (
              <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Chat sẽ tạm dừng sau khi livestream kết thúc.</div>
            )}
          </TabsContent>
          <TabsContent value="stats" className="mt-3">
            <LiveViewerStats viewers={viewers} />
          </TabsContent>
          <TabsContent value="react" className="mt-3">
            <LiveReactionsPanel sessionId={sessionId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
