import { Activity, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface LiveStreamHealthPanelProps {
  status?: string | null;
  sourceConnected: boolean;
  inputConnected: boolean;
  previewReady?: boolean | null;
  connectionStatus?: string | null;
  liveInputStatus?: string | null;
  signalStatus?: string | null;
  reconnectCount?: number | null;
  statusCheckError?: string | null;
  archiveError?: string | null;
}

export function LiveStreamHealthPanel({
  status,
  sourceConnected,
  inputConnected,
  previewReady,
  connectionStatus,
  liveInputStatus,
  signalStatus,
  reconnectCount,
  statusCheckError,
  archiveError,
}: LiveStreamHealthPanelProps) {
  const warning = status === 'disconnect_grace' || status === 'reconnecting' || signalStatus === 'lost' || !!statusCheckError || !!archiveError || (!sourceConnected && status === 'live');
  const icon = warning ? AlertTriangle : CheckCircle2;
  const Icon = icon;
  const label = warning
    ? (status === 'disconnect_grace' || status === 'reconnecting' || signalStatus === 'lost')
      ? 'Mất tín hiệu nguồn phát'
      : 'Cần kiểm tra'
    : 'Nguồn phát ổn định';

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={warning ? 'h-4 w-4 text-amber-600' : 'h-4 w-4 text-emerald-600'} />
          <span className="font-semibold text-sm">{label}</span>
        </div>
        <Badge variant={warning ? 'outline' : 'secondary'}>{connectionStatus || 'monitoring'}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="rounded-md bg-muted/60 p-2">
          <div className="font-medium text-foreground">RTMP input</div>
          <div>{inputConnected ? 'Đã kết nối' : 'Chưa kết nối'}</div>
        </div>
        <div className="rounded-md bg-muted/60 p-2">
          <div className="font-medium text-foreground">Video signal</div>
          <div>{sourceConnected ? 'Đang nhận video' : 'Chưa có video'}</div>
        </div>
        <div className="rounded-md bg-muted/60 p-2">
          <div className="font-medium text-foreground">Preview</div>
          <div>{previewReady ? 'Sẵn sàng' : 'Đang cập nhật'}</div>
        </div>
        <div className="rounded-md bg-muted/60 p-2">
          <div className="font-medium text-foreground">Reconnect</div>
          <div>{reconnectCount || 0} lần</div>
        </div>
      </div>

      {(statusCheckError || archiveError || liveInputStatus) && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
              <Info className="mr-2 h-3.5 w-3.5" />
              Chi tiết kỹ thuật
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2 text-xs text-muted-foreground">
            {liveInputStatus && <div>Live input: {liveInputStatus}</div>}
            {statusCheckError && <div className="text-amber-700">Status check: {statusCheckError}</div>}
            {archiveError && <div className="text-red-700">Archive: {archiveError}</div>}
            <div className="flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" />
              TODO: kết nối metric FPS, bitrate và resolution khi backend trả dữ liệu thật.
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
