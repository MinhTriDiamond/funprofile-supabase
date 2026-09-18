/**
 * SR-2: Gift Dialog — Multi Send Progress Component
 */

import { CheckCircle2, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { AlertCircle } from 'lucide-react';
import type { MultiSendResult, ResolvedRecipient } from './types';

interface MultiSendProgressProps {
  recipients: ResolvedRecipient[];
  progress: { current: number; total: number; results: MultiSendResult[] } | null;
  currentSendingIndex: number;
  isMultiSending: boolean;
}

export function MultiSendProgress({
  recipients,
  progress,
  currentSendingIndex,
  isMultiSending,
}: MultiSendProgressProps) {
  return (
    <div className="space-y-2">
      {/* Recipients list with status */}
      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
        {recipients.map((recipient, idx) => {
          const result = progress?.results.find((r) => r.recipient.id === recipient.id);
          const isSendingNow = currentSendingIndex === idx && isMultiSending && !result;
          return (
            <div
              key={recipient.id}
              className={`flex items-center gap-2.5 p-2 rounded-lg border ${
                result?.success
                  ? 'bg-primary/5 border-primary/30'
                  : result && !result.success
                  ? 'bg-destructive/5 border-destructive/20'
                  : isSendingNow
                  ? 'bg-accent border-accent-foreground/20'
                  : 'bg-muted/30'
              }`}
            >
              <Avatar className="w-8 h-8 border border-border/40">
                <AvatarImage src={recipient.avatarUrl || ''} />
                <AvatarFallback className="bg-primary/20 text-primary text-xs">
                  {recipient.username[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{recipient.displayName || recipient.username}</p>
                <p className="text-[10px] text-muted-foreground truncate">@{recipient.username}</p>
                {result?.txHash && (
                  <p className="text-[10px] text-primary font-mono truncate">{result.txHash.slice(0, 10)}...</p>
                )}
                {result?.error && (
                  <p className="text-[10px] text-destructive truncate">{result.error}</p>
                )}
              </div>
              {result?.success && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              {result && !result.success && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
              {isSendingNow && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Overall progress bar */}
      {progress && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            {isMultiSending ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            )}
            <p className="text-sm font-medium">
              {isMultiSending
                ? `Đang gửi ${progress.current}/${progress.total}...`
                : `Hoàn tất ${progress.results.filter((r) => r.success).length}/${progress.total} giao dịch`}
            </p>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          {progress.results.length > 0 && (
            <p className="text-xs text-muted-foreground">
              ✅ {progress.results.filter((r) => r.success).length} thành công
              {progress.results.some((r) => !r.success) &&
                ` · ❌ ${progress.results.filter((r) => !r.success).length} thất bại`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
