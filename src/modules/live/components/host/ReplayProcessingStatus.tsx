import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { HostLiveUiState, HostRecordingDetails } from './hostLiveTypes';

interface ReplayProcessingStatusProps {
  uiState: HostLiveUiState;
  recording: HostRecordingDetails;
}

export function ReplayProcessingStatus({ uiState, recording }: ReplayProcessingStatusProps) {
  if (uiState === 'live' && !recording.error) return null;

  const progress = Math.max(recording.uploadProgress, recording.compressProgress);

  if (uiState === 'failed' || recording.error) {
    return (
      <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 shadow-sm">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">Livestream dang can kiem tra.</div>
          <div className="text-xs opacity-80">Chi tiet ky thuat da duoc an trong phan thong tin ky thuat.</div>
        </div>
      </div>
    );
  }

  if (uiState === 'replay_ready') {
    return (
      <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 shadow-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">Video replay da san sang</div>
          <div className="text-xs opacity-80">Ban ghi da duoc luu va co the xem lai tren feed.</div>
        </div>
      </div>
    );
  }

  if (!['ending', 'processing_replay'].includes(uiState)) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-semibold">
          {uiState === 'ending' ? 'Dang ket thuc livestream...' : 'Dang xu ly video replay...'}
        </span>
        {progress > 0 && <span className="ml-auto font-mono text-xs">{progress}%</span>}
      </div>
      {progress > 0 && <Progress value={progress} className="h-2" />}
      <p className="mt-2 text-xs opacity-80">He thong dang luu replay, vui long giu tab on dinh trong giay lat.</p>
    </div>
  );
}
