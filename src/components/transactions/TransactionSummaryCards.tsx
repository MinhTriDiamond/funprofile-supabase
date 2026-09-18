/**
 * TransactionSummaryCards — đọc từ get_unified_summary.
 * Unknown KHÔNG cộng vào In/Out/Net, có card "Need Review" riêng.
 */
import { Card, CardContent } from '@/components/ui/card';
import { ArrowDownLeft, ArrowUpRight, Wallet, Clock, HelpCircle, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { UnifiedSummary } from './types';

function fmt(n: number | undefined | null) {
  if (n == null) return '0';
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 6 });
}

interface Props {
  summary: UnifiedSummary | null | undefined;
  isLoading?: boolean;
  onClickNeedReview?: () => void;
}

export function TransactionSummaryCards({ summary, isLoading, onClickNeedReview }: Props) {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="p-3"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const items = [
    { icon: ArrowDownLeft, label: 'Tổng nhận', value: fmt(summary.sum_in), sub: `${summary.count_in} giao dịch`, color: 'text-emerald-600' },
    { icon: ArrowUpRight, label: 'Tổng gửi', value: fmt(summary.sum_out), sub: `${summary.count_out} giao dịch`, color: 'text-rose-600' },
    { icon: Wallet, label: 'Net', value: fmt(summary.net), sub: 'Nhận − Gửi', color: summary.net >= 0 ? 'text-emerald-600' : 'text-rose-600' },
    { icon: Clock, label: 'Đang chờ', value: String(summary.count_pending), sub: 'Pending', color: 'text-amber-600' },
    {
      icon: summary.count_unknown > 0 ? AlertTriangle : HelpCircle,
      label: 'Cần kiểm tra',
      value: String(summary.count_unknown),
      sub: 'Chưa rõ chiều',
      color: summary.count_unknown > 0 ? 'text-amber-600' : 'text-muted-foreground',
      onClick: onClickNeedReview,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {items.map((it) => {
        const Icon = it.icon;
        const clickable = !!it.onClick;
        return (
          <Card
            key={it.label}
            onClick={it.onClick}
            className={clickable ? 'cursor-pointer transition-colors hover:bg-accent/30' : undefined}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className={`h-4 w-4 ${it.color}`} />
                {it.label}
              </div>
              <div className={`mt-1 text-lg font-bold tabular-nums ${it.color}`}>{it.value}</div>
              <div className="text-[11px] text-muted-foreground">{it.sub}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
