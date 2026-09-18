/**
 * BulkRecipientPreview — Hiển thị danh sách người nhận đã chọn với:
 * - Avatar + display name + @username
 * - Ví rút gọn + nút copy
 * - Badge trạng thái: Hợp lệ / Không có ví / Là chính bạn
 * - Nút xoá từng dòng
 *
 * Dùng chung cho cả tab Username, Địa chỉ ví, và Hàng loạt → UX nhất quán.
 */

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, X, ShieldCheck, AlertCircle, Ban, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { ResolvedRecipient } from './types';

interface BulkRecipientPreviewProps {
  recipients: ResolvedRecipient[];
  senderUserId: string | null;
  onRemove: (id: string) => void;
  onClearAll?: () => void;
  /** Số tiền mỗi người (để hiển thị tổng) — optional. */
  amountPerRecipient?: number;
  tokenSymbol?: string;
}

function shortAddr(addr: string): string {
  if (!addr) return '';
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type StatusKind = 'valid' | 'no_wallet' | 'self';

function classifyRecipient(r: ResolvedRecipient, senderId: string | null): StatusKind {
  if (senderId && r.id === senderId) return 'self';
  if (!r.walletAddress) return 'no_wallet';
  return 'valid';
}

const STATUS_META: Record<StatusKind, { label: string; classes: string; Icon: typeof ShieldCheck }> = {
  valid: {
    label: 'Hợp lệ',
    classes: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300',
    Icon: ShieldCheck,
  },
  no_wallet: {
    label: 'Chưa có ví',
    classes: 'bg-destructive/15 text-destructive border-destructive/40',
    Icon: AlertCircle,
  },
  self: {
    label: 'Chính bạn',
    classes: 'bg-destructive/15 text-destructive border-destructive/40',
    Icon: Ban,
  },
};

export function BulkRecipientPreview({
  recipients,
  senderUserId,
  onRemove,
  onClearAll,
  amountPerRecipient,
  tokenSymbol,
}: BulkRecipientPreviewProps) {
  if (recipients.length === 0) return null;

  const validCount = recipients.filter((r) => classifyRecipient(r, senderUserId) === 'valid').length;
  const issueCount = recipients.length - validCount;
  const totalAmount =
    amountPerRecipient && amountPerRecipient > 0 ? amountPerRecipient * validCount : null;

  const handleCopy = (addr: string) => {
    try {
      navigator.clipboard.writeText(addr);
      toast.success('Đã copy địa chỉ ví');
    } catch {
      toast.error('Không thể copy');
    }
  };

  return (
    <div className="rounded-lg border bg-card/50 overflow-hidden">
      {/* Header tóm tắt */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="w-4 h-4 text-primary shrink-0" />
          <div className="text-xs sm:text-sm min-w-0">
            <span className="font-semibold text-foreground">{validCount}</span>
            <span className="text-muted-foreground"> hợp lệ</span>
            {issueCount > 0 && (
              <>
                <span className="text-muted-foreground"> · </span>
                <span className="font-semibold text-destructive">{issueCount}</span>
                <span className="text-muted-foreground"> cần xem lại</span>
              </>
            )}
            {totalAmount !== null && tokenSymbol && (
              <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                · Tổng ≈ {totalAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {tokenSymbol}
              </span>
            )}
          </div>
        </div>
        {onClearAll && recipients.length > 1 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] text-destructive hover:underline shrink-0"
          >
            Xoá tất cả
          </button>
        )}
      </div>

      {/* Danh sách cuộn */}
      <ul className="max-h-[280px] overflow-y-auto divide-y divide-border/60">
        {recipients.map((r) => {
          const status = classifyRecipient(r, senderUserId);
          const meta = STATUS_META[status];
          const Icon = meta.Icon;
          return (
            <li key={r.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30">
              <Avatar className="w-9 h-9 shrink-0">
                <AvatarImage src={r.avatarUrl || ''} alt={r.username} />
                <AvatarFallback className="bg-primary/20 text-primary text-xs">
                  {r.username?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.displayName || r.username}
                  </p>
                  {r.hasVerifiedWallet && (
                    <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">@{r.username}</span>
                  {r.walletAddress && (
                    <>
                      <span className="opacity-60">·</span>
                      <span className="font-mono truncate">{shortAddr(r.walletAddress)}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(r.walletAddress!)}
                        className="p-0.5 rounded hover:bg-muted shrink-0"
                        aria-label="Copy địa chỉ ví"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <Badge variant="outline" className={`gap-1 text-[10px] py-0.5 shrink-0 ${meta.classes}`}>
                <Icon className="w-3 h-3" />
                {meta.label}
              </Badge>

              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(r.id)}
                aria-label={`Xoá @${r.username}`}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
