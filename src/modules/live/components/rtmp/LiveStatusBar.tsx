import { useEffect, useMemo, useState } from 'react';
import { Activity, Circle, Clock, Eye, Gauge, Radio, Signal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LiveDurationLimitState } from '../../hooks/useLiveDurationLimit';

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60).toString().padStart(2, '0');
  const seconds = (safe % 60).toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

interface LiveStatusBarProps {
  status: string | null | undefined;
  startedAt?: string | null;
  viewerCount: number;
  sourceConnected: boolean;
  inputConnected: boolean;
  previewReady?: boolean | null;
  connectionStatus?: string | null;
  signalStatus?: string | null;
  resolution?: string | null;
  fps?: string | number | null;
  bitrate?: string | number | null;
  durationLimit?: LiveDurationLimitState;
}

export function LiveStatusBar({
  status,
  startedAt,
  viewerCount,
  sourceConnected,
  inputConnected,
  previewReady,
  connectionStatus,
  signalStatus,
  resolution,
  fps,
  bitrate,
  durationLimit,
}: LiveStatusBarProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const duration = useMemo(() => {
    const start = startedAt ? Date.parse(startedAt) : NaN;
    if (!Number.isFinite(start)) return '00:00';
    return formatDuration((now - start) / 1000);
  }, [now, startedAt]);
  const durationLabel = durationLimit?.combinedLabel || duration;

  const isReconnecting = status === 'disconnect_grace' || status === 'reconnecting' || signalStatus === 'lost';
  const healthLabel = isReconnecting
    ? 'Đang reconnect'
    : sourceConnected && previewReady
      ? 'Tốt'
      : inputConnected
        ? 'Chờ video'
        : connectionStatus || 'Đang cập nhật';

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 xl:grid-cols-7">
        <div className="flex items-center gap-2">
          <Badge variant={isReconnecting ? 'outline' : 'destructive'} className="gap-1">
            <Circle className="h-2.5 w-2.5 fill-current" />
            {isReconnecting ? 'Mất tín hiệu' : 'Đang live'}
          </Badge>
        </div>
        <div className={cn(
          'flex items-center gap-2',
          durationLimit?.warningLevel === 'urgent'
            ? 'text-red-700'
            : durationLimit?.warningLevel === 'warning'
              ? 'text-amber-700'
              : 'text-muted-foreground',
        )}>
          <Clock className="h-4 w-4" />
          <span className="font-medium text-foreground">{durationLabel}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Eye className="h-4 w-4" />
          <span className="font-medium text-foreground">{viewerCount}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span className="font-medium text-foreground">{healthLabel}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Signal className="h-4 w-4" />
          <span>{resolution || 'Đang cập nhật'}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Radio className="h-4 w-4" />
          <span>{fps ? `${fps} FPS` : 'FPS chưa có dữ liệu'}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Gauge className="h-4 w-4" />
          <span>{bitrate ? `${bitrate} kbps` : 'Bitrate chưa có dữ liệu'}</span>
        </div>
      </div>
    </div>
  );
}
