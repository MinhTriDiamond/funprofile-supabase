/**
 * GiftStatusFloatingBar — thanh nổi hiển thị trạng thái giao dịch Tặng đang chạy.
 * Render kể cả khi dialog đã đóng / user vừa quay lại từ app ví.
 *
 * Mount ở Profile + Wallet để user luôn thấy "ví đang dùng" + "gift đang gửi".
 */
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ExternalLink, Gift, Loader2, X } from 'lucide-react';
import { useGiftTransaction, type GiftTxStep } from '@/contexts/GiftTransactionContext';

const STEP_LABEL: Record<GiftTxStep, string> = {
  idle: '',
  connecting: 'Đang kết nối ví…',
  signing: 'Đang chờ bạn ký trong ví…',
  broadcasted: 'Đang xử lý giao dịch…',
  confirming: 'Đang xử lý giao dịch…',
  finalizing: 'Đang hoàn tất…',
  success: 'Đã tặng thành công 🎁',
  error: 'Giao dịch chưa hoàn tất',
};

const STEP_PROGRESS: Record<GiftTxStep, number> = {
  idle: 0,
  connecting: 8,
  signing: 20,
  broadcasted: 55,
  confirming: 75,
  finalizing: 90,
  success: 100,
  error: 100,
};

export function GiftStatusFloatingBar() {
  const { current, dismiss } = useGiftTransaction();
  if (!current || current.step === 'idle') return null;

  const isError = current.step === 'error';
  const isDone = current.step === 'success';
  const isWorking = !isError && !isDone;

  return (
    <div
      className="fixed inset-x-0 z-40 px-3 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto mx-auto max-w-md rounded-2xl border shadow-lg backdrop-blur-md bg-card/95 transition-all ${
          isError ? 'border-destructive/40' : isDone ? 'border-emerald-400/60' : 'border-primary/30'
        }`}
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="relative shrink-0">
            <Avatar className="h-9 w-9">
              <AvatarImage src={current.recipientAvatarUrl ?? undefined} />
              <AvatarFallback className="text-xs">
                {current.recipientUsername?.[0]?.toUpperCase() ?? <Gift className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            {isWorking && (
              <span className="absolute -bottom-1 -right-1 rounded-full bg-background p-0.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Gift className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                Tặng <strong className="text-foreground">{current.amount} {current.tokenSymbol}</strong>
                {current.recipientUsername ? <> cho <span className="text-foreground">@{current.recipientUsername}</span></> : null}
              </span>
            </div>
            <div className={`text-sm font-medium truncate ${
              isError ? 'text-destructive' : isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
            }`}>
              {isError ? (current.errorTitle || STEP_LABEL.error) : STEP_LABEL[current.step]}
            </div>
            {isError && current.errorDescription && (
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{current.errorDescription}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {current.scanUrl && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => window.open(current.scanUrl!, '_blank', 'noopener')}
                title="Xem trên blockchain explorer"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={dismiss}
              title="Đóng"
              aria-label="Đóng thông báo giao dịch"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="px-3 pb-2.5">
          <Progress
            value={STEP_PROGRESS[current.step]}
            className={`h-1.5 ${isError ? '[&>div]:bg-destructive' : isDone ? '[&>div]:bg-emerald-500' : ''}`}
          />
        </div>
      </div>
    </div>
  );
}

export default GiftStatusFloatingBar;
