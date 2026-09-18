import { Check, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReplayProcessingStatusProps {
  status?: string | null;
  endReason?: string | null;
  archiveError?: string | null;
  onViewPost?: () => void;
}

export function ReplayProcessingStatus({ status, endReason, archiveError, onViewPost }: ReplayProcessingStatusProps) {
  const ready = status === 'archived' || status === 'posted';
  const failed = status === 'failed';

  if (failed) {
    return (
      <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <div className="font-medium">Livestream gặp sự cố nhưng dữ liệu kỹ thuật đã được ghi nhận.</div>
          {archiveError && <div className="mt-1 text-xs">Chi tiết: {archiveError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={ready ? 'flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900' : 'flex gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900'}>
      {ready ? <Check className="h-4 w-4 shrink-0 mt-0.5" /> : <Loader2 className="h-4 w-4 shrink-0 mt-0.5 animate-spin" />}
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {ready
            ? 'Video replay đã sẵn sàng'
            : endReason === 'disconnect_timeout' || endReason === 'obs_signal_lost_timeout'
              ? 'Live đã tự kết thúc vì mất tín hiệu quá lâu. Đang xử lý video replay...'
              : 'Đang xử lý video replay...'}
        </div>
        <div className="mt-1 text-xs opacity-80">
          {ready ? 'Bản ghi đã được lưu và có thể xem lại trên feed.' : 'Quá trình này có thể mất vài phút tùy độ dài livestream.'}
        </div>
      </div>
      {ready && onViewPost && (
        <Button size="sm" variant="secondary" onClick={onViewPost}>
          Xem bài live
        </Button>
      )}
    </div>
  );
}
