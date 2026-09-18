/**
 * TransactionList — infinite scroll thuần (chưa virtualize, theo quyết định M5).
 */
import { useEffect, useRef } from 'react';
import { TransactionRow } from './TransactionRow';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { UnifiedTransactionRow } from './types';

interface Props {
  rows: UnifiedTransactionRow[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  loadMore: () => void;
  onRowClick: (row: UnifiedTransactionRow) => void;
  onCardClick?: (row: UnifiedTransactionRow) => void;
  emptyMessage?: string;
  error?: Error | null;
  onRetry?: () => void;
}

export function TransactionList({
  rows, isLoading, isFetchingNextPage, hasNextPage, loadMore, onRowClick, onCardClick, emptyMessage, error, onRetry,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, loadMore]);

  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  if (error && rows.length === 0) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        <div className="font-semibold">Chưa tải được lịch sử giao dịch.</div>
        <div className="mt-1 text-destructive/80">
          {error.message || 'Máy chủ tạm thời chưa trả được dữ liệu. Vui lòng thử lại.'}
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Tải lại lịch sử
          </Button>
        ) : null}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyMessage ?? 'Chưa có giao dịch nào khớp với bộ lọc.'}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <TransactionRow
          key={`${r.source_table}:${r.source_id}:${r.direction}`}
          row={r}
          onClick={onRowClick}
          onCardClick={onCardClick ?? onRowClick}
        />
      ))}

      {hasNextPage && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={loadMore}>
            {isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
          </Button>
        </div>
      )}
    </div>
  );
}
