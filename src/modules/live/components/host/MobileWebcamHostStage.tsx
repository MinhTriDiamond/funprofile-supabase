import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Heart,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  MoreHorizontal,
  PhoneOff,
  Send,
  SwitchCamera,
  Users,
  Video,
  VideoOff,
  WifiOff,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { LiveChatPanel } from '../LiveChatPanel';
import { LiveFloatingReactions } from './LiveFloatingReactions';
import { LiveChatOverlay } from './LiveChatOverlay';
import { LiveStreamHealthBar } from './LiveStreamHealthBar';
import { TechnicalInfoCollapse } from './TechnicalInfoCollapse';
import { ReplayProcessingStatus } from './ReplayProcessingStatus';
import { LiveEndSummaryCard } from './LiveEndSummaryCard';
import { useVisualViewportInset } from '../../hooks/useVisualViewportInset';
import type { HostLiveCommonProps } from './hostLiveTypes';

const REACTION_EMOJI = '❤️';

export function MobileWebcamHostStage(props: HostLiveCommonProps) {
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
    isMuted,
    isCameraOff,
    isSwitchingCamera,
    isEnding,
    statusText,
    liveHealth,
    networkQuality,
    previewStats,
    setLocalContainerRef,
    onSendMessage,
    onReact,
    onToggleMute,
    onToggleCamera,
    onSwitchCamera,
    onRequestEnd,
    onViewPost,
  } = props;

  const [composer, setComposer] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const composerRef = useRef<HTMLInputElement>(null);
  const keyboardInset = useVisualViewportInset();

  const showConnecting = !isJoined || uiState === 'reconnecting';

  // Khi vào màn live trên mobile, đảm bảo cuộn đầu để user thấy mặt mình
  useEffect(() => {
    if (uiState === 'live') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [uiState]);

  // Khi rời màn live, báo Feed refetch để thấy ngay bài replay vừa tạo
  useEffect(() => {
    return () => {
      try {
        window.dispatchEvent(new Event('invalidate-feed'));
      } catch {
        /* noop */
      }
    };
  }, []);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = composer.trim();
    if (!value) return;
    try {
      await onSendMessage(value);
      setComposer('');
      composerRef.current?.blur();
    } catch {
      // toast đã được xử lý ở caller
    }
  };

  const peakViewers = Math.max(session.viewer_count || 0, viewers.length);
  const showSummary = uiState === 'ending' || uiState === 'processing_replay' || uiState === 'replay_ready' || uiState === 'failed';

  if (showSummary) {
    return (
      <div
        className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-gradient-to-br from-emerald-950 via-slate-950 to-black text-white"
        style={{ minHeight: '100dvh' }}
      >
        <div
          className="flex-1 px-3 pb-6"
          style={{
            paddingTop: 'max(env(safe-area-inset-top), 16px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
          }}
        >
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
            compact
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black text-white overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {/* Video fullscreen */}
      <div
        ref={setLocalContainerRef}
        className="absolute inset-0 bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-cover [&_video]:object-center"
      />

      {/* Gradient top/bottom để text dễ đọc */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/65 via-black/25 to-transparent" />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent"
        style={{ height: '40%' }}
      />

      {/* Floating reactions trên video */}
      <div className="absolute inset-0 pointer-events-none">
        <LiveFloatingReactions reactions={reactions} />
      </div>

      {/* TOP BAR */}
      <div
        className="absolute inset-x-0 top-0 z-20 px-3 pb-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onViewPost}
            className="h-10 w-10 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center"
            aria-label="Quay lại"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold tracking-wide">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              LIVE
            </span>
            <span className="rounded-full bg-black/50 backdrop-blur-md px-2.5 py-1 text-[12px] font-semibold tabular-nums">
              {durationLimit.combinedLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-md px-2.5 py-1 text-[12px] font-semibold">
              <Users className="h-3.5 w-3.5" />
              {viewers.length}
            </span>
          </div>

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className="h-10 w-10 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center"
                aria-label="Tuỳ chọn khác"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Thông tin & cài đặt phiên live</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Đang xem" value={viewers.length} />
                  <StatCard label="Đỉnh điểm" value={peakViewers} />
                  <StatCard label="Tương tác" value={reactionCount} />
                  <StatCard label="Bình luận" value={messages.length} />
                </div>
                <LiveStreamHealthBar
                  uiState={uiState}
                  liveHealth={liveHealth}
                  networkQuality={networkQuality}
                  previewStats={previewStats}
                  statusText={statusText}
                />
                <ReplayProcessingStatus uiState={uiState} recording={recording} />
                <TechnicalInfoCollapse
                  channelName={session.agora_channel || session.channel_name}
                  statusText={statusText}
                  recording={recording}
                  networkQuality={networkQuality}
                  previewStats={previewStats}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* RIGHT RAIL */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3">
        <RailButton
          icon={isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          label={isMuted ? 'Bật mic' : 'Tắt mic'}
          onClick={onToggleMute}
          danger={isMuted}
        />
        <RailButton
          icon={isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          label={isCameraOff ? 'Bật cam' : 'Tắt cam'}
          onClick={onToggleCamera}
          danger={isCameraOff}
        />
        <RailButton
          icon={
            isSwitchingCamera ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <SwitchCamera className="h-5 w-5" />
            )
          }
          label="Đổi cam"
          onClick={() => onSwitchCamera()}
          disabled={isCameraOff || isSwitchingCamera}
        />
        <RailButton
          icon={<Heart className="h-5 w-5 fill-current text-rose-500" />}
          label="Thả tim"
          onClick={() => onReact(REACTION_EMOJI)}
        />
        <RailButton
          icon={<MessageCircle className="h-5 w-5" />}
          label="Chat"
          onClick={() => setChatOpen(true)}
          badge={messages.length}
        />
      </div>

      {/* CONNECTING OVERLAY */}
      {showConnecting && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55">
          <div className="rounded-2xl bg-black/55 px-5 py-4 text-center shadow-xl backdrop-blur">
            {uiState === 'reconnecting' ? (
              <WifiOff className="mx-auto mb-2 h-7 w-7 text-amber-200" />
            ) : (
              <Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin" />
            )}
            <div className="font-semibold">
              {uiState === 'reconnecting'
                ? 'Mất kết nối, đang thử kết nối lại...'
                : statusText || 'Đang chuẩn bị live...'}
            </div>
          </div>
        </div>
      )}

      {durationLimit.warningLevel === 'urgent' && (
        <div className="absolute inset-x-3 top-16 z-30 rounded-2xl border border-red-300/70 bg-red-600/90 px-3 py-2 text-center text-xs font-bold text-white shadow-lg backdrop-blur">
          Livestream sẽ tự động kết thúc sau {Math.ceil((durationLimit.remainingSeconds || 0) / 60)} phút để đảm bảo chất lượng hệ thống.
        </div>
      )}

      {/* BOTTOM: chat overlay + composer */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 px-3"
        style={{
          paddingBottom: `calc(max(env(safe-area-inset-bottom), 10px) + ${keyboardInset}px)`,
          transition: 'padding-bottom 0.15s ease-out',
        }}
      >
        <div className="mb-2 pr-20 max-w-[88%]">
          <LiveChatOverlay messages={messages} />
        </div>

        <form onSubmit={handleSubmitComment} className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-md border border-white/15 px-4 py-2">
            <input
              ref={composerRef}
              type="text"
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder="Bình luận..."
              maxLength={500}
              enterKeyHint="send"
              className="flex-1 bg-transparent text-base text-white placeholder:text-white/55 focus:outline-none"
            />
            {composer.trim() && (
              <button
                type="submit"
                className="rounded-full bg-primary p-1.5 text-primary-foreground"
                aria-label="Gửi"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onRequestEnd}
            disabled={isEnding}
            className="h-11 w-11 rounded-full bg-red-600 hover:bg-red-700 active:bg-red-800 flex items-center justify-center shadow-lg disabled:opacity-60"
            aria-label="Kết thúc live"
          >
            {isEnding ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <PhoneOff className="h-5 w-5" />
            )}
          </button>
        </form>
      </div>

      {/* FULL CHAT DRAWER */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="bottom" className="h-[80dvh] flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-2 border-b">
            <SheetTitle>Bình luận trực tiếp</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0">
            <LiveChatPanel
              sessionId={sessionId}
              isHost
              viewers={viewers}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RailButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-center gap-1 disabled:opacity-50"
    >
      <span
        className={`relative h-11 w-11 rounded-full backdrop-blur-md flex items-center justify-center shadow ${
          danger ? 'bg-red-600/80 text-white' : 'bg-black/45 text-white'
        }`}
      >
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium text-white/90 drop-shadow">{label}</span>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-black">{value.toLocaleString()}</div>
    </div>
  );
}
