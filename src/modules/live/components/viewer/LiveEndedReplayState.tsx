import { Loader2, PlayCircle, RotateCcw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LiveEndedReplayStateProps {
  state: 'ended' | 'processing_replay' | 'failed';
  onGoHome?: () => void;
  onOpenPost?: () => void;
  hasPost?: boolean;
}

export function LiveEndedReplayState({ state, onGoHome, onOpenPost, hasPost }: LiveEndedReplayStateProps) {
  const isFailed = state === 'failed';
  const title = isFailed ? 'Không thể tải livestream' : 'Livestream đã kết thúc';
  const description = isFailed
    ? 'Video replay đang được xử lý, vui lòng quay lại sau.'
    : state === 'processing_replay'
      ? 'Phiên live đã kết thúc, replay đang được xử lý.'
      : 'Đang chuẩn bị bản phát lại cho bạn.';

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/78 px-4 text-center text-white">
      <div className="max-w-sm space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white shadow-xl backdrop-blur">
          {isFailed ? <WifiOff className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
        </div>
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="mt-2 text-sm text-white/75">{description}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {hasPost && onOpenPost && (
            <Button onClick={onOpenPost} size="lg" className="gap-2 rounded-full bg-primary px-6 font-black shadow-lg hover:bg-primary/90">
              <PlayCircle className="h-5 w-5" />
              Xem replay
            </Button>
          )}
          {onGoHome && (
            <Button variant="secondary" onClick={onGoHome} className="gap-1.5 rounded-full">
              <RotateCcw className="h-4 w-4" />
              Về trang chủ
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
