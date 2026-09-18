import { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { UsdRankingRow, type UsdRankingRowData } from './UsdRankingRow';

interface UsdRankingListProps {
  rows: UsdRankingRowData[];
  isLoading: boolean;
  emptyIcon?: ReactNode;
  emptyText?: string;
  onRowClick?: (userId: string) => void;
}

export function UsdRankingList({
  rows,
  isLoading,
  emptyIcon,
  emptyText = 'Chưa có dữ liệu',
  onRowClick,
}: UsdRankingListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyIcon && <div className="flex justify-center mb-4 opacity-50">{emptyIcon}</div>}
        <p>{emptyText}</p>
      </div>
    );
  }

  const topUsd = rows.reduce((max, r) => Math.max(max, r.total_usd || 0), 0);

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <UsdRankingRow key={row.user_id} row={row} topUsd={topUsd} onClick={onRowClick} />
      ))}
    </div>
  );
}
