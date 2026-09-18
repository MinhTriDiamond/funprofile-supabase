import { Activity, Clock, Eye, Heart, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LiveDurationLimitState } from '../../hooks/useLiveDurationLimit';
import type { HostLiveUiState, HostRecordingDetails } from './hostLiveTypes';

interface HostLiveStatsBarProps {
  uiState: HostLiveUiState;
  liveDuration: string;
  durationLimit?: LiveDurationLimitState;
  viewerCount: number;
  reactionCount: number;
  recording: HostRecordingDetails;
}

function recordingLabel(recording: HostRecordingDetails) {
  if (recording.state === 'recording') return 'Đang lưu replay';
  if (recording.state === 'ready') return 'Replay sẵn sàng';
  if (['stopping', 'compressing', 'processing'].includes(recording.state)) return 'Đang xử lý replay';
  if (recording.state === 'failed') return 'Cần kiểm tra replay';
  return 'Replay standby';
}

export function HostLiveStatsBar({ uiState, liveDuration, durationLimit, viewerCount, reactionCount, recording }: HostLiveStatsBarProps) {
  const isLive = uiState === 'live' || uiState === 'reconnecting';
  const durationLabel = durationLimit?.combinedLabel || liveDuration;
  const warning = durationLimit?.warningLevel;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className={`gap-1.5 rounded-full px-3 py-1.5 text-white shadow-sm ${isLive ? 'bg-red-600 shadow-[0_0_18px_rgba(220,38,38,0.28)]' : 'bg-muted-foreground'}`}>
        <span className="relative flex h-2 w-2">
          {isLive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />}
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        {isLive ? 'LIVE' : uiState === 'replay_ready' ? 'REPLAY' : 'ENDED'}
      </Badge>
      <span className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold',
        warning === 'urgent'
          ? 'bg-red-100 text-red-800 ring-1 ring-red-300'
          : warning === 'warning'
            ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
            : 'bg-muted/70',
      )}>
        <Clock className={cn('h-3.5 w-3.5', warning === 'urgent' ? 'text-red-700' : warning === 'warning' ? 'text-amber-700' : 'text-primary')} />
        {durationLabel}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1.5 text-xs font-bold transition-all duration-300">
        <Eye className="h-3.5 w-3.5 text-emerald-700" />
        {viewerCount} xem
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1.5 text-xs font-bold transition-all duration-300">
        <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
        {reactionCount.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
        <Save className="h-3.5 w-3.5" />
        {recordingLabel(recording)}
      </span>
      {uiState === 'reconnecting' && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
          <Activity className="h-3.5 w-3.5" />
          Kết nối lại
        </span>
      )}
    </div>
  );
}
