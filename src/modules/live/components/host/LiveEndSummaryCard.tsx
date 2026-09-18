import { CheckCircle2, Clock, Eye, Gift, Heart, Home, Loader2, MessageCircle, PlayCircle, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLiveSessionGifts } from '../../hooks/useLiveSessionGifts';
import type { HostLiveUiState } from './hostLiveTypes';

interface LiveEndSummaryCardProps {
  uiState: HostLiveUiState;
  liveDuration: string;
  peakViewers: number;
  reactionCount: number;
  commentCount: number;
  hasPost: boolean;
  postId?: string | null;
  onViewPost: () => void;
  onGoHome: () => void;
  compact?: boolean;
}

function StatTile({ icon: Icon, label, value, tone }: {
  icon: typeof Eye;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-white/60">{label}</div>
        <div className="mt-0.5 truncate text-lg font-black tabular-nums text-white">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
      </div>
    </div>
  );
}

export function LiveEndSummaryCard({
  uiState,
  liveDuration,
  peakViewers,
  reactionCount,
  commentCount,
  hasPost,
  postId,
  onViewPost,
  onGoHome,
  compact = false,
}: LiveEndSummaryCardProps) {
  const gifts = useLiveSessionGifts(postId, hasPost);
  const isProcessing = uiState === 'ending' || uiState === 'processing_replay';
  const isReady = uiState === 'replay_ready';
  const isFailed = uiState === 'failed';

  const statusIcon = isReady ? (
    <CheckCircle2 className="h-6 w-6 text-emerald-300" />
  ) : isFailed ? (
    <TriangleAlert className="h-6 w-6 text-amber-300" />
  ) : (
    <Loader2 className="h-6 w-6 animate-spin text-primary-foreground" />
  );

  const title = isReady
    ? 'Buổi LIVE đã kết thúc'
    : isFailed
      ? 'Buổi LIVE đã kết thúc — replay chưa lưu được'
      : 'Đang hoàn tất buổi LIVE...';

  const subtitle = isReady
    ? 'Replay đã sẵn sàng trên feed. Cảm ơn Cha đã lan tỏa ánh sáng!'
    : isFailed
      ? 'Video replay không lưu được lần này, các thống kê vẫn được ghi nhận.'
      : 'Hệ thống đang xử lý replay — vui lòng giữ tab thêm chút xíu.';

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-emerald-950 via-slate-950 to-black shadow-[0_24px_80px_rgba(15,23,42,0.5)] ring-1 ring-gold/20">
      <div className="px-6 pt-6 pb-4 md:px-8 md:pt-8">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
            {statusIcon}
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-black leading-tight text-white md:text-3xl">{title}</h2>
            <p className="mt-1 text-sm font-medium text-white/70">{subtitle}</p>
          </div>
        </div>

        <div className={`mt-6 grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
          <StatTile icon={Clock} label="Thời lượng" value={liveDuration} tone="bg-primary/20 text-primary-foreground" />
          <StatTile icon={Eye} label="Đỉnh điểm" value={peakViewers} tone="bg-amber-500/20 text-amber-200" />
          <StatTile icon={Heart} label="Tương tác" value={reactionCount} tone="bg-rose-500/20 text-rose-200" />
          <StatTile icon={MessageCircle} label="Bình luận" value={commentCount} tone="bg-emerald-500/20 text-emerald-200" />
        </div>

        {hasPost && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white/60">
              <Gift className="h-4 w-4 text-gold" />
              Quà nhận trong buổi live
            </div>
            {gifts.isLoading ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-white/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tổng hợp quà...
              </div>
            ) : (gifts.data?.count ?? 0) === 0 ? (
              <div className="mt-2 text-sm text-white/70">
                Chưa có quà trong buổi này. Cảm ơn cộng đồng vẫn ở bên Cha.
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-black text-gold">
                  {gifts.data!.count.toLocaleString()} quà
                </span>
                {gifts.data!.byToken.slice(0, 6).map((t) => (
                  <span
                    key={t.symbol}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white"
                  >
                    {t.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {t.symbol}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 bg-black/40 px-6 py-4 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {hasPost && (
            <Button
              onClick={onViewPost}
              className="rounded-full bg-white px-5 py-6 text-sm font-black text-slate-950 hover:bg-white/90"
            >
              {isReady ? (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Xem replay trên feed
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Xem bài đăng
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onGoHome}
            className="rounded-full border-white/25 bg-transparent px-5 py-6 text-sm font-bold text-white hover:bg-white/10"
          >
            <Home className="mr-2 h-4 w-4" />
            Về trang chủ
          </Button>
          {isProcessing && (
            <div className="ml-auto flex items-center gap-2 text-xs font-semibold text-white/70">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang xử lý replay...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
