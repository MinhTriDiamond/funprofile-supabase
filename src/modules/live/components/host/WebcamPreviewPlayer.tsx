import { Eye, Heart, Loader2, Radio, Timer, WifiOff } from 'lucide-react';
import type { RefCallback } from 'react';
import type { HostLiveUiState } from './hostLiveTypes';
import { LiveFloatingReactions } from './LiveFloatingReactions';
import type { LiveReaction } from '../../hooks/useLiveReactions';

interface WebcamPreviewPlayerProps {
  setLocalContainerRef: RefCallback<HTMLDivElement>;
  isJoined: boolean;
  statusText: string;
  uiState: HostLiveUiState;
  reactions: LiveReaction[];
  liveDuration: string;
  viewerCount: number;
  reactionCount: number;
}

function MetricPill({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Eye;
  value: string | number;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur-md transition-all duration-300">
      <Icon className="h-3.5 w-3.5 text-white/85" />
      <span>{value}</span>
      <span className="hidden text-white/65 sm:inline">{label}</span>
    </div>
  );
}

export function WebcamPreviewPlayer({
  setLocalContainerRef,
  isJoined,
  statusText,
  uiState,
  reactions,
  liveDuration,
  viewerCount,
  reactionCount,
}: WebcamPreviewPlayerProps) {
  const showConnecting = !isJoined || uiState === 'reconnecting';

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.35)] ring-1 ring-gold/20">
      <div className="relative aspect-video min-h-[420px] bg-gradient-to-br from-slate-950 via-slate-900 to-black">
        <div
          ref={setLocalContainerRef}
          className="h-full w-full bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-contain [&_video]:object-center"
        />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.18),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/65 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent" />

        <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-black uppercase tracking-wide text-white shadow-[0_0_24px_rgba(220,38,38,0.45)]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            LIVE
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <MetricPill icon={Timer} value={liveDuration} label="live" />
            <MetricPill icon={Eye} value={viewerCount.toLocaleString()} label="đang xem" />
            <MetricPill icon={Heart} value={reactionCount.toLocaleString()} label="tương tác" />
          </div>
        </div>

        {showConnecting && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/58 p-6 text-white backdrop-blur-sm">
            <div className="max-w-sm rounded-3xl border border-white/10 bg-black/55 px-6 py-5 text-center shadow-2xl">
              {uiState === 'reconnecting' ? (
                <WifiOff className="mx-auto mb-3 h-8 w-8 text-amber-200" />
              ) : (
                <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-emerald-200" />
              )}
              <div className="text-base font-bold">
                {uiState === 'reconnecting' ? 'Đang khôi phục tín hiệu live...' : statusText}
              </div>
              <p className="mt-1 text-sm text-white/70">
                Camera và micro vẫn được giữ an toàn trong khi FUN Profile kết nối lại studio.
              </p>
            </div>
          </div>
        )}

        <LiveFloatingReactions reactions={reactions} />

        <div className="absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/92 px-3.5 py-2 text-sm font-bold text-primary shadow-xl backdrop-blur">
          <Radio className="h-4 w-4" />
          Host preview
        </div>
      </div>
    </div>
  );
}
